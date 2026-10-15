import "server-only";
// Orphan rule: children of a tombstoned parent are tombstoned by the server.
// Ownership chains only (references are not ownership: deleting a custom exercise or a machine profile never erases history):
//   template -> templateExercise        workout -> workoutExercise -> workoutSet
// plus a custom exercise's favorites (a star is not history: it goes with the exercise, and the FK is NoAction so GC needs it tombstoned first).
// Runs after the batch's own writes, in both directions:
//   A. a parent tombstoned in this batch takes its (still alive) children with it;
//   B. a child written in this batch under an already tombstoned parent is tombstoned (e.g. a set logged offline into a
//      workout another device deleted).
// Tombstones minted here carry a server HLC above the row's previous deletedAt HLC, so a replayed older "undelete"
// cannot resurrect a child under a deleted parent.
import type { EntityName } from "@/contracts/entities";
import { maxHlc } from "@/lib/sync/hlc";
import { rowHlc } from "@/lib/sync/merge";
import type { Batch } from "./batch";
import { ADAPTERS, fieldHlcOf, type DbRow } from "./entities";

async function tombstone(batch: Batch, entity: EntityName, rows: DbRow[]): Promise<void> {
  const delegate = ADAPTERS[entity].delegate(batch.tx);
  for (const row of rows) {
    if (row.deletedAt != null) continue;
    const fieldHlc = fieldHlcOf(row);
    const hlc = batch.clock.receive(fieldHlc.deletedAt ?? maxHlc(Object.values(fieldHlc)));
    const next = { ...fieldHlc, deletedAt: hlc };
    await delegate.update({
      where: { id: row.id as string },
      data: { deletedAt: new Date(batch.nowMs), fieldHlc: next, hlc: rowHlc(next), version: batch.nextVersion() },
    });
    if (entity === "workoutSet") batch.seriesKeys.add(row.seriesKey as string);
  }
}

const idsOf = (rows: DbRow[]) => rows.map((r) => r.id as string);

async function deadAmong(batch: Batch, entity: EntityName, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await ADAPTERS[entity]
    .delegate(batch.tx)
    .findMany({ where: { id: { in: ids }, userId: batch.ctx.id, deletedAt: { not: null } }, select: { id: true } });
  return new Set(idsOf(rows));
}

/** Touched children that are alive and whose parent (by `parentField`) is already tombstoned get tombstoned. */
async function tombstoneUnderDeadParent(batch: Batch, child: EntityName, parent: EntityName, parentField: string): Promise<string[]> {
  const alive = batch.touchedOf(child).filter((t) => t.values.deletedAt == null);
  if (alive.length === 0) return [];
  const parentIds = [...new Set(alive.map((t) => t.values[parentField] as string))];
  const dead = await deadAmong(batch, parent, parentIds);
  const doomed = alive.filter((t) => dead.has(t.values[parentField] as string)).map((t) => t.id);
  if (doomed.length === 0) return [];
  const rows = await ADAPTERS[child].delegate(batch.tx).findMany({ where: { id: { in: doomed }, userId: batch.ctx.id } });
  await tombstone(batch, child, rows);
  return doomed;
}

export async function applyOrphanRule(batch: Batch): Promise<void> {
  const { tx, ctx } = batch;
  const isDead = (t: { values: Record<string, unknown> }) => t.values.deletedAt != null;

  // B (templateExercise, workoutExercise): children written under an already dead parent.
  await tombstoneUnderDeadParent(batch, "templateExercise", "template", "templateId");
  await tombstoneUnderDeadParent(batch, "exerciseFavorite", "exercise", "exerciseId");
  const deadWeIds = new Set(await tombstoneUnderDeadParent(batch, "workoutExercise", "workout", "workoutId"));

  // A: parents tombstoned in this batch take their live children.
  const deadExercises = batch.touchedOf("exercise").filter(isDead).map((t) => t.id);
  if (deadExercises.length > 0) {
    const stars = await ADAPTERS.exerciseFavorite.delegate(tx).findMany({ where: { userId: ctx.id, exerciseId: { in: deadExercises }, deletedAt: null } });
    await tombstone(batch, "exerciseFavorite", stars);
  }
  const deadTemplates = batch.touchedOf("template").filter(isDead).map((t) => t.id);
  if (deadTemplates.length > 0) {
    const children = await ADAPTERS.templateExercise
      .delegate(tx)
      .findMany({ where: { userId: ctx.id, templateId: { in: deadTemplates }, deletedAt: null } });
    await tombstone(batch, "templateExercise", children);
  }
  const deadWorkouts = batch.touchedOf("workout").filter(isDead).map((t) => t.id);
  if (deadWorkouts.length > 0) {
    const children = await ADAPTERS.workoutExercise.delegate(tx).findMany({ where: { userId: ctx.id, workoutId: { in: deadWorkouts } } });
    await tombstone(batch, "workoutExercise", children);
    for (const id of idsOf(children)) deadWeIds.add(id);
  }
  for (const t of batch.touchedOf("workoutExercise")) if (isDead(t)) deadWeIds.add(t.id);
  if (deadWeIds.size > 0) {
    const sets = await ADAPTERS.workoutSet
      .delegate(tx)
      .findMany({ where: { userId: ctx.id, workoutExerciseId: { in: [...deadWeIds] }, deletedAt: null } });
    await tombstone(batch, "workoutSet", sets);
  }

  // B (workoutSet): a set written under an already dead workout exercise.
  await tombstoneUnderDeadParent(batch, "workoutSet", "workoutExercise", "workoutExerciseId");
}
