import "server-only";
// The last load per exercise for the signed-in user: the heaviest working set (warm-ups never count) of the most recent day
// the exercise was trained. Two queries: the latest day per exercise, then that day's sets. Always filtered by ctx.id.
import type { ExerciseRow } from "@/contracts/entities";
import type { UserCtx } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { dateToLocalDate } from "@/lib/dates";
import type { LastLoad } from "@/lib/analytics/last-load";
import { exerciseToRow } from "@/server/mappers";

const COUNTED = { deletedAt: null, completedAt: { not: null }, setType: { not: "WARMUP" } } as const;

interface Options {
  /** Only these exercises (a library page). */
  exerciseIds?: readonly string[];
  /** Only the most recently trained N (the "yours" list), newest first. */
  limit?: number;
}

/** Last loads by exercise id. With `limit` the map's insertion order is newest first. */
export async function listLastLoads(ctx: UserCtx, { exerciseIds, limit }: Options = {}): Promise<Map<string, LastLoad>> {
  if (exerciseIds && exerciseIds.length === 0) return new Map();
  const days = await prisma.workoutSet.groupBy({
    by: ["exerciseId"],
    where: { userId: ctx.id, ...COUNTED, ...(exerciseIds ? { exerciseId: { in: [...exerciseIds] } } : {}) },
    _max: { localDate: true },
    orderBy: { _max: { localDate: "desc" } },
    ...(limit ? { take: limit } : {}),
  });
  const latest = days.flatMap((d) => (d._max.localDate ? [{ exerciseId: d.exerciseId, localDate: d._max.localDate }] : []));
  if (latest.length === 0) return new Map();

  const sets = await prisma.workoutSet.findMany({
    where: { userId: ctx.id, ...COUNTED, OR: latest.map((l) => ({ exerciseId: l.exerciseId, localDate: l.localDate })) },
    select: { exerciseId: true, localDate: true, weightKg: true, reps: true, inputUnit: true, effectiveLoadKg: true, machineProfile: { select: { pinStepKg: true } } },
  });

  const best = new Map<string, { load: LastLoad; rank: number; reps: number }>();
  for (const s of sets) {
    const weightKg = s.weightKg == null ? null : s.weightKg.toNumber();
    const rank = s.effectiveLoadKg?.toNumber() ?? weightKg ?? 0;
    const reps = s.reps ?? 0;
    const current = best.get(s.exerciseId);
    if (current && (current.rank > rank || (current.rank === rank && current.reps >= reps))) continue;
    best.set(s.exerciseId, {
      rank,
      reps,
      load: { exerciseId: s.exerciseId, localDate: dateToLocalDate(s.localDate), weightKg, reps: s.reps, pinStepKg: s.machineProfile?.pinStepKg?.toNumber() ?? null, inputUnit: s.inputUnit },
    });
  }
  // newest first, as the day query ordered them
  const out = new Map<string, LastLoad>();
  for (const l of latest) {
    const found = best.get(l.exerciseId);
    if (found) out.set(l.exerciseId, found.load);
  }
  return out;
}

/** The exercises the user trained most recently (catalog or their own, not deleted), newest first, with their last loads. */
export async function listRecentExercises(ctx: UserCtx, limit: number): Promise<{ exercises: ExerciseRow[]; loads: Map<string, LastLoad> }> {
  const loads = await listLastLoads(ctx, { limit });
  if (loads.size === 0) return { exercises: [], loads };
  const rows = await prisma.exercise.findMany({
    where: { id: { in: [...loads.keys()] }, deletedAt: null, OR: [{ userId: null }, { userId: ctx.id }] },
    include: { muscles: true },
  });
  const byId = new Map(rows.map((r) => [r.id, exerciseToRow(r)]));
  return { exercises: [...loads.keys()].flatMap((id) => byId.get(id) ?? []), loads };
}

export interface ExerciseWithLoad {
  exercise: Pick<ExerciseRow, "id" | "name" | "equipment" | "loadType" | "isUnilateral">;
  load: LastLoad | null;
}

/** The fields a drawing needs and the last load, for a few exercises (the Today lift tiles). Visible exercises only. */
export async function listExercisesWithLoads(ctx: UserCtx, exerciseIds: readonly string[]): Promise<Map<string, ExerciseWithLoad>> {
  if (exerciseIds.length === 0) return new Map();
  const [rows, loads] = await Promise.all([
    prisma.exercise.findMany({
      where: { id: { in: [...exerciseIds] }, deletedAt: null, OR: [{ userId: null }, { userId: ctx.id }] },
      select: { id: true, name: true, equipment: true, loadType: true, isUnilateral: true },
    }),
    listLastLoads(ctx, { exerciseIds }),
  ]);
  return new Map(rows.map((r) => [r.id, { exercise: r, load: loads.get(r.id) ?? null }]));
}
