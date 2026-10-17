import "server-only";
// Tombstone garbage collection. Hard-deletes tombstones older than TOMBSTONE_TTL_DAYS and raises SyncState.gcFloorVersion
// to the highest version it removed, so a client whose cursor is below the floor (it may have missed a deletion that no
// longer exists) is told to `reset` and re-pull.
//
// FKs between synced rows are NoAction, so the order is children before parents (sets -> workoutExercises -> workouts;
// templateExercises -> templates; exerciseFavorites; machineProfiles; bodyMetrics; exercises). A tombstone that something live (or an
// unexpired tombstone) still references is left in place until that reference is collected: never cascade into live data.
// Each user is processed in its own transaction under the SyncState lock, so a concurrent sync cannot interleave.
//
// PersonalRecord.workout is ON DELETE CASCADE (the only cascade into derived data), so hard-deleting a workout would silently
// take any PR row that still points at it. PRs are a pure function of live sets and the orphan rule rebuilds them when a
// workout's sets are tombstoned, so that should not happen; but a stale row (a direct write, an older bug) would be lost
// together with the better candidates it should have been replaced by. GC therefore rebuilds the series of any PR that
// points at a tombstone it is about to collect before deleting, and the workout guard refuses to delete a workout a PR
// still references. The other PR foreign keys (exercise, machineProfile) are NoAction and guarded the same way;
// PersonalRecord.setId has no foreign key.
import { ENTITY_NAMES, type EntityName } from "@/contracts/entities";
import { TOMBSTONE_TTL_DAYS } from "@/contracts/sync";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { rebuildSeriesPrs } from "@/server/prs/rebuild";
import { ADAPTERS, type Tx } from "./entities";

const none = { none: {} };

/** Per entity: extra conditions that make a tombstone safe to hard-delete, in deletion order. */
const GC_PLAN: { entity: EntityName; guard: Record<string, unknown> }[] = [
  { entity: "workoutSet", guard: {} },
  { entity: "workoutExercise", guard: { sets: none } },
  { entity: "workout", guard: { exercises: none, sets: none, personalRecords: none } },
  { entity: "templateExercise", guard: {} },
  { entity: "template", guard: { exercises: none, workouts: none } },
  { entity: "exerciseFavorite", guard: {} },
  { entity: "machineProfile", guard: { templateExercises: none, workoutExercises: none, workoutSets: none, personalRecords: none } },
  { entity: "bodyMetric", guard: {} },
  { entity: "exercise", guard: { machineProfiles: none, templateExercises: none, workoutExercises: none, workoutSets: none, personalRecords: none, favorites: none } },
];

export interface GcScope {
  /** Only collect for these users (and expire only their dead letters). Omit for every user: that is what the cron does. */
  userIds: readonly string[];
}

export interface GcSummary {
  users: number;
  deleted: Record<EntityName, number>;
  /** Series whose PR rows pointed at a tombstone being collected and were rebuilt first (normally 0). */
  prSeriesRebuilt: number;
  /** Dead-letter rows (rejected mutations kept for debugging) older than the same cutoff. */
  deadLetters: number;
  cutoff: string;
}

/** Series whose PersonalRecord rows point at an expired tombstoned workout or set (stale: a PR is built from live sets only). */
async function seriesWithStalePrs(tx: Tx, userId: string, cutoff: Date): Promise<string[]> {
  const series = new Set<string>();
  const byWorkout = await tx.personalRecord.findMany({
    where: { userId, workout: { deletedAt: { lt: cutoff } } },
    select: { seriesKey: true },
    distinct: ["seriesKey"],
  });
  for (const row of byWorkout) series.add(row.seriesKey);

  const withSet = await tx.personalRecord.findMany({ where: { userId, setId: { not: null } }, select: { seriesKey: true, setId: true } });
  if (withSet.length > 0) {
    const dead = await tx.workoutSet.findMany({
      where: { userId, id: { in: withSet.map((r) => r.setId as string) }, deletedAt: { lt: cutoff } },
      select: { id: true },
    });
    const deadIds = new Set(dead.map((r) => r.id));
    for (const row of withSet) if (deadIds.has(row.setId as string)) series.add(row.seriesKey);
  }
  return [...series];
}

/** Returns how many series had their PRs rebuilt before the deletes. */
async function collectForUser(tx: Tx, userId: string, cutoff: Date, deleted: Record<EntityName, number>): Promise<number> {
  await tx.$executeRaw`INSERT INTO "SyncState" ("userId", "updatedAt") VALUES (${userId}, now()) ON CONFLICT ("userId") DO NOTHING`;
  const [state] = await tx.$queryRaw<{ gcFloorVersion: number }[]>`SELECT "gcFloorVersion" FROM "SyncState" WHERE "userId" = ${userId} FOR UPDATE`;
  let floor = state?.gcFloorVersion ?? 0;

  const stale = await seriesWithStalePrs(tx, userId, cutoff);
  if (stale.length > 0) await rebuildSeriesPrs(tx, mintUserCtx(userId), stale);

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
  return stale.length;
}

/**
 * Collect tombstones older than `ttlDays` before `now`. Without a `scope` every user is processed (the daily cron,
 * /api/sync/gc). Tests MUST pass a scope: an unscoped run on a shared database hard-deletes every user's tombstones,
 * expires every user's dead letters and raises every user's gcFloorVersion (their clients are told to reset).
 */
export async function collectTombstones(now: Date = new Date(), ttlDays: number = TOMBSTONE_TTL_DAYS, scope?: GcScope): Promise<GcSummary> {
  const cutoff = new Date(now.getTime() - ttlDays * 24 * 60 * 60 * 1000);
  const deleted = Object.fromEntries(ENTITY_NAMES.map((e) => [e, 0])) as Record<EntityName, number>;
  // An empty scope means "nobody", never "everybody".
  const scoped = scope ? { userId: { in: [...scope.userIds] } } : null;

  const users = new Set<string>();
  for (const entity of ENTITY_NAMES) {
    const owner = scoped ?? (entity === "exercise" ? { userId: { not: null } } : {});
    const rows = await ADAPTERS[entity].delegate(prisma).findMany({ where: { deletedAt: { lt: cutoff }, ...owner }, distinct: ["userId"], select: { userId: true } });
    for (const row of rows) users.add(row.userId as string);
  }
  let prSeriesRebuilt = 0;
  for (const userId of users) {
    prSeriesRebuilt += await prisma.$transaction((tx) => collectForUser(tx, userId, cutoff, deleted));
  }
  const { count: deadLetters } = await prisma.syncDeadLetter.deleteMany({ where: { createdAt: { lt: cutoff }, ...(scoped ?? {}) } });
  return { users: users.size, deleted, prSeriesRebuilt, deadLetters, cutoff: cutoff.toISOString() };
}
