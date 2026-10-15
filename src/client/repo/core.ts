// Shared machinery of the client repo: validation, the one-transaction write path (row + field HLCs + outbox), tombstones
// with the local orphan cascade, and the local mirror of WorkoutSet derived columns.
import type { z } from "zod";
import {
  ENTITY_FIELDS_SCHEMAS,
  ENTITY_PATCH_SCHEMAS,
  ENTITY_REFS,
  type EntityName,
  type EntityTypeMap,
  type ExerciseRow,
  type WorkoutSetRow,
} from "@/contracts/entities";
import { RepoError } from "@/contracts/repo";
import { newId, isUuid } from "@/lib/ids";
import { deriveSetColumns } from "@/lib/sync/derive";
import { maxHlc } from "@/lib/sync/hlc";
import { valuesEqual } from "@/lib/sync/merge";
import { tickHlc } from "@/client/db/clock";
import type { OverloadDb } from "@/client/db/schema";
import { dx } from "@/client/db/zone";

export type AnyRow = { id: string; deletedAt: string | null; fieldHlc: Record<string, string>; hlc: string } & Record<string, unknown>;

export const nowIso = (): string => new Date().toISOString();

/** Run `fn` in ONE read-write Dexie transaction over every table (joins an outer transaction when nested). */
export function writeTx<T>(db: OverloadDb, fn: () => Promise<T>): Promise<T> {
  return db.transaction("rw", db.tables, fn);
}

export function readTx<T>(db: OverloadDb, fn: () => Promise<T>): Promise<T> {
  return db.transaction("r", db.tables, fn);
}

function failParse(entity: EntityName, error: z.ZodError): never {
  const unknownKeys = error.issues.filter((i) => i.code === "unrecognized_keys").flatMap((i) => ("keys" in i ? (i.keys as string[]) : []));
  if (unknownKeys.length > 0) {
    throw new RepoError("FORBIDDEN_FIELD", `${entity}: ${unknownKeys.join(", ")} cannot be written by the client`);
  }
  const detail = error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
  throw new RepoError("INVALID", `${entity}: ${detail}`);
}

/** Validate create input (strict: forbidden keys throw). Returns every writable field with defaults applied. */
export function parseCreate<E extends EntityName>(entity: E, input: unknown): Record<string, unknown> {
  const parsed = ENTITY_FIELDS_SCHEMAS[entity].safeParse(input);
  if (!parsed.success) failParse(entity, parsed.error);
  return parsed.data as Record<string, unknown>;
}

/** Validate a patch (strict; defaults are not applied). `undefined` values are dropped. */
export function parsePatch<E extends EntityName>(entity: E, patch: unknown): Record<string, unknown> {
  const parsed = ENTITY_PATCH_SCHEMAS[entity].safeParse(patch);
  if (!parsed.success) failParse(entity, parsed.error);
  return Object.fromEntries(Object.entries(parsed.data as Record<string, unknown>).filter(([, v]) => v !== undefined));
}

export function assertUuid(id: string): void {
  if (!isUuid(id)) throw new RepoError("INVALID", `"${id}" is not a UUID`);
}

export function freshId(opts?: { id?: string }): string {
  if (opts?.id !== undefined) {
    assertUuid(opts.id);
    return opts.id;
  }
  return newId();
}

/** A row of `entity` by id. Exercises look in the custom table first, then the catalog. Includes tombstones. */
export const findRow = dx(async function findRow(db: OverloadDb, entity: EntityName, id: string): Promise<AnyRow | undefined> {
  const row = (await db.entityTable(entity).get(id)) as AnyRow | undefined;
  if (row || entity !== "exercise") return row;
  return (await db.catalog.get(id)) as AnyRow | undefined;
});

export const isCatalogExercise = dx(async function isCatalogExercise(db: OverloadDb, id: string): Promise<boolean> {
  return (await db.catalog.get(id)) !== undefined && (await db.exercise.get(id)) === undefined;
});

/** Every reference the written fields mention must exist locally (alive or tombstoned). */
export const checkRefs = dx(async function checkRefs(db: OverloadDb, entity: EntityName, fields: Record<string, unknown>): Promise<void> {
  for (const ref of ENTITY_REFS[entity]) {
    const value = fields[ref.field];
    if (typeof value !== "string") continue;
    if (!(await findRow(db, ref.entity, value))) throw new RepoError("NOT_FOUND", `${entity}.${ref.field}: no ${ref.entity} ${value}`);
  }
});

export const enqueue = dx(async function enqueue(
  db: OverloadDb,
  entity: EntityName,
  id: string,
  fields: Record<string, unknown>,
  fieldHlc: Record<string, string>,
): Promise<void> {
  await db.outbox.add({ mutationId: newId(), entity, id, fields, fieldHlc, createdAt: nowIso() });
});

// ───────────────────────────── derived set columns (local mirror) ─────────────────────────────

/** Local copy of the server's derivation. Null when a parent row has not reached this device. */
export const deriveLocal = dx(async function deriveLocal(
  db: OverloadDb,
  set: { workoutExerciseId: string; weightKg: number | null; reps: number | null; rir: number | null },
): Promise<ReturnType<typeof deriveSetColumns> | null> {
  const we = await db.workoutExercise.get(set.workoutExerciseId);
  if (!we) return null;
  // Sequential awaits on purpose: a native Promise.all inside a Dexie transaction loses the ambient transaction.
  const workout = await db.workout.get(we.workoutId);
  const exercise = (await findRow(db, "exercise", we.exerciseId)) as ExerciseRow | undefined;
  const machine = we.machineProfileId ? await db.machineProfile.get(we.machineProfileId) : undefined;
  if (!workout || !exercise) return null;
  let fallbackBodyweightKg: number | null = null;
  if (exercise.loadType === "BODYWEIGHT_PLUS" && workout.bodyweightKg == null) {
    const metrics = (await db.bodyMetric.orderBy("localDate").toArray()).filter((m) => !m.deletedAt && m.weightKg != null);
    const before = metrics.filter((m) => m.localDate <= workout.localDate);
    fallbackBodyweightKg = (before.at(-1) ?? metrics[0])?.weightKg ?? null;
  }
  return deriveSetColumns({
    set,
    workoutExercise: we,
    workout,
    exercise,
    machineProfile: machine ? { baseLoadKg: machine.baseLoadKg } : null,
    fallbackBodyweightKg,
  });
});

/** Recompute the mirrored derived columns of sets (after the set or one of its parents changed). No outbox entry: the server derives its own. */
export const rederiveSets = dx(async function rederiveSets(db: OverloadDb, sets: WorkoutSetRow[]): Promise<void> {
  for (const set of sets) {
    const derived = await deriveLocal(db, set);
    if (!derived) continue;
    const changed = (Object.keys(derived) as (keyof typeof derived)[]).some((k) => !valuesEqual(set[k], derived[k]));
    if (changed) await db.workoutSet.put({ ...set, ...derived });
  }
});

/** Re-derive the sets that depend on a changed parent row. */
export const rederiveDependents = dx(async function rederiveDependents(db: OverloadDb, entity: EntityName, row: AnyRow): Promise<void> {
  let sets: WorkoutSetRow[] = [];
  switch (entity) {
    case "workout":
      sets = await db.workoutSet.where("workoutId").equals(row.id).toArray();
      break;
    case "workoutExercise":
      sets = await db.workoutSet.where("workoutExerciseId").equals(row.id).toArray();
      break;
    case "machineProfile":
      sets = await db.workoutSet.where("machineProfileId").equals(row.id).toArray();
      break;
    case "exercise":
      sets = await db.workoutSet.where("exerciseId").equals(row.id).toArray();
      break;
    case "bodyMetric":
      sets = (await db.workoutSet.toArray()).filter((s) => s.localDate >= (row.localDate as string));
      break;
    default:
      return;
  }
  await rederiveSets(db, sets.filter((s) => !s.deletedAt));
});

// ───────────────────────────── writes ─────────────────────────────

/** Write a patch onto an existing row: per-field HLCs, row hlc, updatedAt, outbox. Returns the stored row. */
export const applyPatch = dx(async function applyPatch(db: OverloadDb, entity: EntityName, row: AnyRow, patch: Record<string, unknown>): Promise<AnyRow> {
  const hlc = await tickHlc(db);
  const fieldHlc = { ...row.fieldHlc, ...Object.fromEntries(Object.keys(patch).map((f) => [f, hlc])) };
  let next: AnyRow = { ...row, ...patch, fieldHlc, hlc: maxHlc([row.hlc, hlc]), updatedAt: nowIso() };
  if (entity === "workoutSet") {
    const derived = await deriveLocal(db, next as unknown as WorkoutSetRow);
    if (derived) next = { ...next, ...derived };
  }
  await db.entityTable(entity).put(next);
  await enqueue(db, entity, row.id, patch, Object.fromEntries(Object.keys(patch).map((f) => [f, hlc])));
  if (!(Object.keys(patch).length === 1 && "deletedAt" in patch)) await rederiveDependents(db, entity, next);
  return next;
});

/** Tombstone `row` (idempotent) and, for owning parents, everything below it. */
export const tombstone = dx(async function tombstone(db: OverloadDb, entity: EntityName, row: AnyRow): Promise<void> {
  if (row.deletedAt) return;
  await applyPatch(db, entity, row, { deletedAt: nowIso() });
  const children: [EntityName, string, string][] = [];
  if (entity === "template") children.push(["templateExercise", "templateId", row.id]);
  if (entity === "workout") {
    children.push(["workoutExercise", "workoutId", row.id], ["workoutSet", "workoutId", row.id]);
  }
  if (entity === "workoutExercise") children.push(["workoutSet", "workoutExerciseId", row.id]);
  for (const [childEntity, index, value] of children) {
    const rows = (await db.entityTable(childEntity).where(index).equals(value).toArray()) as AnyRow[];
    for (const child of rows) await tombstone(db, childEntity, child);
  }
});

export type RowOf<E extends EntityName> = EntityTypeMap[E]["row"];
