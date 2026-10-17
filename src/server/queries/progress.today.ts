import "server-only";
// /today loaders (stream DIAL, part TODAY). Every function takes `ctx` and filters by ctx.id; the result is plain data (kg and
// ISO dates). Shaping lives in the pure src/lib/analytics/lifts.ts.
import { addDays, isoWeekStart, localDateToDate, type LocalDate } from "@/lib/dates";
import { buildTodayLifts, TILE_LIFTS, TODAY_HISTORY_WEEKS, type TodayLifts } from "@/lib/analytics/lifts";
import type { WeightUnit } from "@/lib/units";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { exerciseRowToMeta, loadProfileFact, machineProfileRowToMeta, setRowToFact } from "@/server/queries/facts";
import { loadToday } from "@/server/queries/progress";

export interface TodayLiftsData extends TodayLifts {
  unit: WeightUnit;
}

/** The four main lifts' estimates and the 12-week chart. Reads only the standard-lift exercises' sets (52 weeks). */
export async function loadTodayLifts(ctx: UserCtx, opts: { today?: LocalDate } = {}): Promise<TodayLiftsData> {
  const today = opts.today ?? (await loadToday(ctx));
  const from = addDays(isoWeekStart(today), -7 * TODAY_HISTORY_WEEKS);
  const [profile, exerciseRows] = await Promise.all([
    loadProfileFact(ctx, today),
    prisma.exercise.findMany({
      where: { standardLift: { in: [...TILE_LIFTS] }, modality: "FREE_WEIGHT", OR: [{ userId: null }, { userId: ctx.id }] },
      include: { muscles: true },
    }),
  ]);
  const exerciseIds = exerciseRows.map((e) => e.id);
  const setRows = exerciseIds.length
    ? await prisma.workoutSet.findMany({
        where: {
          userId: ctx.id,
          exerciseId: { in: exerciseIds },
          deletedAt: null,
          completedAt: { not: null },
          localDate: { gte: localDateToDate(from), lte: localDateToDate(today) },
          workout: { userId: ctx.id, deletedAt: null },
          workoutExercise: { userId: ctx.id, deletedAt: null },
        },
        include: { workout: { select: { isDeload: true, bodyweightKg: true } } },
        orderBy: [{ localDate: "asc" }, { completedAt: "asc" }, { position: "asc" }],
      })
    : [];
  const machineIds = [...new Set(setRows.flatMap((r) => (r.machineProfileId ? [r.machineProfileId] : [])))];
  const machineRows = machineIds.length ? await prisma.machineProfile.findMany({ where: { userId: ctx.id, id: { in: machineIds } } }) : [];

  const lifts = buildTodayLifts({
    today,
    profile,
    exercises: exerciseRows.map(exerciseRowToMeta),
    machineProfiles: machineRows.map(machineProfileRowToMeta),
    sets: setRows.map(setRowToFact),
    bodyMetrics: [],
  });
  return { ...lifts, unit: profile.unitPreference };
}
