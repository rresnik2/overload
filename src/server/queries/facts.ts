import "server-only";
// Facts loaders: the data feed for analytics and the weekly narrative. IMPLEMENTED and FROZEN in Phase 0.
//   loadSetFacts      completed, non-deleted sets in a localDate range + the exercises/machine profiles they reference
//   loadBodyFacts     body metrics in a range
//   loadProfileFact   the lifter's profile as analytics facts (defaults when no profile row yet)
//   loadAnalyticsInput  all of the above bundled as AnalyticsInput (default 16-week lookback)
// Every query filters by ctx.id. Prisma rows are converted by the pure functions below (Decimal -> number here, never above).
import type {
  Exercise,
  ExerciseMuscle,
  MachineProfile,
  Profile,
  Workout,
  WorkoutSet,
  BodyMetric,
} from "@/generated/prisma/client";
import type {
  AnalyticsInput,
  BodyMetricFact,
  ExerciseMeta,
  MachineProfileMeta,
  ProfileFact,
  SetFact,
} from "@/contracts/analytics";
import { addDays, ageInYears, isoWeekStart, localDateToDate, type LocalDate } from "@/lib/dates";
import { prisma } from "@/server/db";
import { loadProfileRowCached } from "@/server/profile/row";
import type { UserCtx } from "@/server/auth/ctx";
import { iso, localDate, num } from "@/server/mappers";

export const DEFAULT_LOOKBACK_WEEKS = 16;

export interface SetFactsBundle {
  exercises: ExerciseMeta[];
  machineProfiles: MachineProfileMeta[];
  /** Oldest first (localDate, completedAt, position). */
  sets: SetFact[];
}

// ───────────────────────────── pure row -> fact mapping (unit-tested without a database) ─────────────────────────────

export type SetRowWithWorkout = WorkoutSet & { workout: Pick<Workout, "isDeload" | "bodyweightKg"> };

export function setRowToFact(row: SetRowWithWorkout): SetFact {
  if (!row.completedAt) throw new Error("setRowToFact: planned set (completedAt is null)");
  return {
    id: row.id,
    workoutId: row.workoutId,
    exerciseId: row.exerciseId,
    machineProfileId: row.machineProfileId,
    seriesKey: row.seriesKey,
    localDate: localDate(row.localDate),
    completedAt: iso(row.completedAt),
    setType: row.setType,
    weightKg: num(row.weightKg),
    effectiveLoadKg: num(row.effectiveLoadKg),
    reps: row.reps,
    rir: num(row.rir),
    durationSec: row.durationSec,
    distanceM: num(row.distanceM),
    e1rmKg: num(row.e1rmKg),
    isDeload: row.workout.isDeload,
    workoutBodyweightKg: num(row.workout.bodyweightKg),
  };
}

export function exerciseRowToMeta(row: Exercise & { muscles: ExerciseMuscle[] }): ExerciseMeta {
  return {
    id: row.id,
    name: row.name,
    modality: row.modality,
    equipment: row.equipment,
    loadType: row.loadType,
    tracking: row.tracking,
    isUnilateral: row.isUnilateral,
    bodyweightFactor: num(row.bodyweightFactor),
    standardLift: row.standardLift,
    mechanic: row.mechanic,
    muscles: row.muscles.map((m) => ({ muscle: m.muscle, role: m.role })),
  };
}

export function machineProfileRowToMeta(row: MachineProfile): MachineProfileMeta {
  return {
    id: row.id,
    name: row.name,
    gymName: row.gymName,
    brand: row.brand,
    exerciseId: row.exerciseId,
    labelUnit: row.labelUnit,
    pinStepKg: num(row.pinStepKg),
    baseLoadKg: num(row.baseLoadKg),
  };
}

export function bodyMetricRowToFact(row: BodyMetric): BodyMetricFact {
  return {
    localDate: localDate(row.localDate),
    weightKg: num(row.weightKg),
    bodyFatPct: num(row.bodyFatPct),
    bodyFatMethod: row.bodyFatMethod,
    neckCm: num(row.neckCm),
    waistCm: num(row.waistCm),
    hipCm: num(row.hipCm),
    chestCm: num(row.chestCm),
    armCm: num(row.armCm),
    thighCm: num(row.thighCm),
    calfCm: num(row.calfCm),
  };
}

export function profileRowToFact(row: Profile | null, today: LocalDate): ProfileFact {
  const birth = row?.birthDate ? localDate(row.birthDate) : null;
  return {
    sex: row?.sex ?? null,
    birthDate: birth,
    ageYears: birth ? ageInYears(birth, today) : null,
    heightCm: num(row?.heightCm),
    experience: row?.experience ?? null,
    goal: row?.goal ?? null,
    e1rmFormula: row?.e1rmFormula ?? "EPLEY",
    unitPreference: row?.unitPreference ?? "KG",
    timezone: row?.timezone ?? "UTC",
  };
}

// ───────────────────────────── loaders ─────────────────────────────

export async function loadSetFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<SetFactsBundle> {
  const rows = await prisma.workoutSet.findMany({
    where: {
      userId: ctx.id,
      deletedAt: null,
      completedAt: { not: null },
      localDate: { gte: localDateToDate(range.from), lte: localDateToDate(range.to) },
      workout: { userId: ctx.id, deletedAt: null },
      workoutExercise: { userId: ctx.id, deletedAt: null },
    },
    include: { workout: { select: { isDeload: true, bodyweightKg: true } } },
    orderBy: [{ localDate: "asc" }, { completedAt: "asc" }, { position: "asc" }],
  });

  const exerciseIds = [...new Set(rows.map((r) => r.exerciseId))];
  const machineProfileIds = [...new Set(rows.flatMap((r) => (r.machineProfileId ? [r.machineProfileId] : [])))];

  const [exercises, machineProfiles] = await Promise.all([
    exerciseIds.length
      ? prisma.exercise.findMany({
          // global catalog rows (userId null) or this user's own custom exercises, tombstoned or not (history stays readable)
          where: { id: { in: exerciseIds }, OR: [{ userId: null }, { userId: ctx.id }] },
          include: { muscles: true },
        })
      : Promise.resolve([]),
    machineProfileIds.length
      ? prisma.machineProfile.findMany({ where: { userId: ctx.id, id: { in: machineProfileIds } } })
      : Promise.resolve([]),
  ]);

  return {
    exercises: exercises.map(exerciseRowToMeta),
    machineProfiles: machineProfiles.map(machineProfileRowToMeta),
    sets: rows.map(setRowToFact),
  };
}

export async function loadBodyFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<BodyMetricFact[]> {
  const rows = await prisma.bodyMetric.findMany({
    where: {
      userId: ctx.id,
      deletedAt: null,
      localDate: { gte: localDateToDate(range.from), lte: localDateToDate(range.to) },
    },
    orderBy: [{ localDate: "asc" }, { measuredAt: "asc" }],
  });
  return rows.map(bodyMetricRowToFact);
}

export async function loadProfileFact(ctx: UserCtx, today: LocalDate): Promise<ProfileFact> {
  const row = await loadProfileRowCached(ctx);
  return profileRowToFact(row, today);
}

/** Everything the rule engine and facts builder read, over `lookbackWeeks` ISO weeks ending today. */
export async function loadAnalyticsInput(
  ctx: UserCtx,
  opts: { today: LocalDate; lookbackWeeks?: number },
): Promise<AnalyticsInput> {
  const lookbackWeeks = opts.lookbackWeeks ?? DEFAULT_LOOKBACK_WEEKS;
  const range = { from: addDays(isoWeekStart(opts.today), -7 * lookbackWeeks), to: opts.today };
  const [profile, bundle, bodyMetrics] = await Promise.all([
    loadProfileFact(ctx, opts.today),
    loadSetFacts(ctx, range),
    loadBodyFacts(ctx, range),
  ]);
  return { today: opts.today, profile, ...bundle, bodyMetrics };
}
