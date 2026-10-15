import "server-only";
// Tombstone garbage collection. Hard-deletes tombstones older than TOMBSTONE_TTL_DAYS and raises SyncState.gcFloorVersion
// to the highest version it removed, so a client whose cursor is below the floor (it may have missed a deletion that no
// longer exists) is told to `reset` and re-pull.
//
// FKs between synced rows are NoAction, so the order is children before parents (sets -> workoutExercises -> workouts;
// templateExercises -> templates; machineProfiles; bodyMetrics; exercises). A tombstone that something live (or an
// unexpired tombstone) still references is left in place until that reference is collected: never cascade into live data.
// Each user is processed in its own transaction under the SyncState lock, so a concurrent sync cannot interleave.
import { ENTITY_NAMES, type EntityName } from "@/contracts/entities";
import { TOMBSTONE_TTL_DAYS } from "@/contracts/sync";
import { prisma } from "@/server/db";
import { ADAPTERS, type Tx } from "./entities";

const none = { none: {} };

/** Per entity: extra conditions that make a tombstone safe to hard-delete, in deletion order. */
const GC_PLAN: { entity: EntityName; guard: Record<string, unknown> }[] = [
  { entity: "workoutSet", guard: {} },
  { entity: "workoutExercise", guard: { sets: none } },
  { entity: "workout", guard: { exercises: none, sets: none } },
  { entity: "templateExercise", guard: {} },
  { entity: "template", guard: { exercises: none, workouts: none } },
  { entity: "machineProfile", guard: { templateExercises: none, workoutExercises: none, workoutSets: none, personalRecords: none } },
  { entity: "bodyMetric", guard: {} },
  { entity: "exercise", guard: { machineProfiles: none, templateExercises: none, workoutExercises: none, workoutSets: none, personalRecords: none } },
];

export interface GcSummary {
  users: number;
  deleted: Record<EntityName, number>;
  cutoff: string;
}

async function collectForUser(tx: Tx, userId: string, cutoff: Date, deleted: Record<EntityName, number>): Promise<void> {
  await tx.$executeRaw`INSERT INTO "SyncState" ("userId", "updatedAt") VALUES (${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
  const [state] = await tx.$queryRaw<{ gcFloorVersion: number }[]>`SELECT "gcFloorVersion" FROM "SyncState" WHERE "userId" = ${userId} FOR UPDATE`;
  let floor = state?.gcFloorVersion ?? 0;

  for (const { entity, guard } of GC_PLAN) {
    const delegate = ADAPTERS[entity].delegate(tx);
    const where = { userId, deletedAt: { lt: cutoff }, ...guard };
    const [top] = await delegate.findMany({ where, select: { version: true }, orderBy: { version: "desc" }, take: 1 });
    if (!top) continue;
    const { count } = await delegate.deleteMany({ where });
    deleted[entity] += count;
    if (count > 0) floor = Math.max(floor, top.version as number);
  }
  await tx.syncState.update({ where: { userId }, data: { gcFloorVersion: floor } });
}

export async function collectTombstones(now: Date = new Date(), ttlDays: number = TOMBSTONE_TTL_DAYS): Promise<GcSummary> {
  const cutoff = new Date(now.getTime() - ttlDays * 24 * 60 * 60 * 1000);
  const deleted = Object.fromEntries(ENTITY_NAMES.map((e) => [e, 0])) as Record<EntityName, number>;

  const users = new Set<string>();
  for (const entity of ENTITY_NAMES) {
    const rows = await ADAPTERS[entity]
      .delegate(prisma)
      .findMany({ where: { deletedAt: { lt: cutoff }, ...(entity === "exercise" ? { userId: { not: null } } : {}) }, distinct: ["userId"], select: { userId: true } });
    for (const row of rows) users.add(row.userId as string);
  }
  for (const userId of users) {
    await prisma.$transaction((tx) => collectForUser(tx, userId, cutoff, deleted));
  }
  return { users: users.size, deleted, cutoff: cutoff.toISOString() };
}
