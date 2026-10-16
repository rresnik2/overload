import "server-only";
// Progress loaders (stream F). Every function takes `ctx` and filters by ctx.id; results are plain data (kg and ISO dates)
// produced by progress.shape.ts from the frozen facts mappers, so no Decimal and no userId ever leaves this module.
import type { ExerciseMeta, MachineProfileMeta, ProfileFact } from "@/contracts/analytics";
import { addDays, isoWeekStart, localDateToDate, toLocalDate, type LocalDate } from "@/lib/dates";
import { isUuid } from "@/lib/ids";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadProfileRowCached } from "@/server/profile/row";
import { localDate as dateOnly } from "@/server/mappers";
import {
  exerciseRowToMeta,
  loadAnalyticsInput,
  loadBodyFacts,
  loadProfileFact,
  machineProfileRowToMeta,
  setRowToFact,
} from "@/server/queries/facts";
import {
  buildExerciseProgress,
  buildOverview,
  HEATMAP_WEEKS,
  HISTORY_WEEKS,
  type ExerciseProgress,
  type ProgressOverview,
} from "./progress.shape";

/** The user's current local date (their profile timezone; UTC before onboarding). Analytics never reads the clock itself. */
export async function loadToday(ctx: UserCtx, now: Date = new Date()): Promise<LocalDate> {
  const profile = await loadProfileRowCached(ctx);
  return toLocalDate(now, profile?.timezone ?? "UTC");
}

async function latestBodyweightKg(ctx: UserCtx, today: LocalDate): Promise<number | null> {
  const facts = await loadBodyFacts(ctx, { from: addDays(today, -365), to: today });
  return facts.findLast((m) => m.weightKg != null)?.weightKg ?? null;
}

export interface ProgressOverviewData extends ProgressOverview {
  profile: Pick<ProfileFact, "unitPreference" | "goal" | "sex">;
}

/** /progress: one card per series, this and last week's sets per muscle, the 16-week heatmap and the DOTS total. */
export async function loadProgressOverview(ctx: UserCtx, opts: { today?: LocalDate } = {}): Promise<ProgressOverviewData> {
  const today = opts.today ?? (await loadToday(ctx));
  const input = await loadAnalyticsInput(ctx, { today, lookbackWeeks: HEATMAP_WEEKS });
  const bodyweightKg = input.bodyMetrics.findLast((m) => m.weightKg != null)?.weightKg ?? (await latestBodyweightKg(ctx, today));
  const overview = buildOverview({
    today,
    profile: input.profile,
    exercises: input.exercises,
    machineProfiles: input.machineProfiles,
    sets: input.sets,
    bodyweightKg,
  });
  return { ...overview, profile: { unitPreference: input.profile.unitPreference, goal: input.profile.goal, sex: input.profile.sex } };
}

export interface ExerciseProgressData extends ExerciseProgress {
  today: LocalDate;
  unit: ProfileFact["unitPreference"];
}

/**
 * /progress/[exerciseId]: the exercise's series (default + one per machine profile) and the charts for `seriesKey`
 * (default: the most recently trained series). null when the exercise does not exist for this user or was never logged.
 */
export async function loadExerciseProgress(
  ctx: UserCtx,
  exerciseId: string,
  opts: { seriesKey?: string | null; today?: LocalDate } = {},
): Promise<ExerciseProgressData | null> {
  if (!isUuid(exerciseId)) return null;
  const today = opts.today ?? (await loadToday(ctx));
  const from = addDays(isoWeekStart(today), -7 * HISTORY_WEEKS);

  const [exerciseRow, setRows, firstWorkout, profile] = await Promise.all([
    prisma.exercise.findFirst({
      where: { id: exerciseId, OR: [{ userId: null }, { userId: ctx.id }] },
      include: { muscles: true },
    }),
    prisma.workoutSet.findMany({
      where: {
        userId: ctx.id,
        exerciseId,
        deletedAt: null,
        completedAt: { not: null },
        localDate: { gte: localDateToDate(from), lte: localDateToDate(today) },
        workout: { userId: ctx.id, deletedAt: null },
        workoutExercise: { userId: ctx.id, deletedAt: null },
      },
      include: { workout: { select: { isDeload: true, bodyweightKg: true } } },
      orderBy: [{ localDate: "asc" }, { completedAt: "asc" }, { position: "asc" }],
    }),
    prisma.workout.findFirst({
      where: { userId: ctx.id, deletedAt: null },
      orderBy: { localDate: "asc" },
      select: { localDate: true },
    }),
    loadProfileFact(ctx, today),
  ]);
  if (!exerciseRow) return null;

  const machineIds = [...new Set(setRows.flatMap((r) => (r.machineProfileId ? [r.machineProfileId] : [])))];
  const machineRows = machineIds.length ? await prisma.machineProfile.findMany({ where: { userId: ctx.id, id: { in: machineIds } } }) : [];

  const exercise: ExerciseMeta = exerciseRowToMeta(exerciseRow);
  const machineProfiles: MachineProfileMeta[] = machineRows.map(machineProfileRowToMeta);
  const bodyweightKg = await latestBodyweightKg(ctx, today);

  const progress = buildExerciseProgress({
    exercise,
    machineProfiles,
    sets: setRows.map(setRowToFact),
    selectedKey: opts.seriesKey,
    profile,
    today,
    firstWorkoutDate: firstWorkout ? dateOnly(firstWorkout.localDate) : null,
    bodyweightKg,
  });
  return { ...progress, today, unit: profile.unitPreference };
}
