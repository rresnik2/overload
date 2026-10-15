// Prisma row -> contract Row mappers. FROZEN after Phase 0.
// THIS is where Decimal becomes number and Date becomes ISO string: Decimal never leaves src/server.
// Rows never include userId. Every query that returns data to a client goes through one of these.
import type {
  BodyMetric,
  Exercise,
  ExerciseFavorite,
  ExerciseMuscle,
  MachineProfile,
  PersonalRecord,
  Profile,
  Template,
  TemplateExercise,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "@/generated/prisma/client";
import type {
  BodyMetricRow,
  ExerciseFavoriteRow,
  ExerciseRow,
  MachineProfileRow,
  PersonalRecordRow,
  ProfileRow,
  SyncMeta,
  TemplateExerciseRow,
  TemplateRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "@/contracts/entities";
import { dateToLocalDate } from "@/lib/dates";

type DecimalLike = { toNumber(): number };

/** Decimal | null -> number | null. */
export function num(value: DecimalLike | null | undefined): number | null {
  return value == null ? null : value.toNumber();
}
/** Decimal -> number (for NOT NULL columns). */
export function numRequired(value: DecimalLike): number {
  return value.toNumber();
}
export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const localDate = (d: Date): string => dateToLocalDate(d);

function fieldHlcOf(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
    return out;
  }
  return {};
}

export function syncMeta(row: {
  hlc: string;
  fieldHlc: unknown;
  version: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SyncMeta {
  return {
    hlc: row.hlc,
    fieldHlc: fieldHlcOf(row.fieldHlc),
    version: row.version,
    deletedAt: isoOrNull(row.deletedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function exerciseToRow(row: Exercise & { muscles: ExerciseMuscle[] }): ExerciseRow {
  return {
    id: row.id,
    isCustom: row.userId !== null,
    sourceId: row.sourceId,
    slug: row.slug,
    name: row.name,
    aliases: row.aliases,
    modality: row.modality,
    equipment: row.equipment,
    loadType: row.loadType,
    tracking: row.tracking,
    bodyweightFactor: num(row.bodyweightFactor),
    isUnilateral: row.isUnilateral,
    mechanic: row.mechanic,
    force: row.force,
    level: row.level,
    category: row.category,
    standardLift: row.standardLift,
    instructions: row.instructions,
    images: row.images,
    muscles: row.muscles.map((m) => ({ muscle: m.muscle, role: m.role })),
    ...syncMeta(row),
  };
}

export function machineProfileToRow(row: MachineProfile): MachineProfileRow {
  return {
    id: row.id,
    name: row.name,
    gymName: row.gymName,
    brand: row.brand,
    exerciseId: row.exerciseId,
    labelUnit: row.labelUnit,
    pinStepKg: num(row.pinStepKg),
    baseLoadKg: num(row.baseLoadKg),
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function exerciseFavoriteToRow(row: ExerciseFavorite): ExerciseFavoriteRow {
  return { id: row.id, exerciseId: row.exerciseId, position: row.position, ...syncMeta(row) };
}

export function bodyMetricToRow(row: BodyMetric): BodyMetricRow {
  return {
    id: row.id,
    measuredAt: iso(row.measuredAt),
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
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function templateToRow(row: Template): TemplateRow {
  return { id: row.id, name: row.name, notes: row.notes, folder: row.folder, position: row.position, ...syncMeta(row) };
}

export function templateExerciseToRow(row: TemplateExercise): TemplateExerciseRow {
  return {
    id: row.id,
    templateId: row.templateId,
    exerciseId: row.exerciseId,
    machineProfileId: row.machineProfileId,
    position: row.position,
    warmupSets: row.warmupSets,
    workingSets: row.workingSets,
    repMin: row.repMin,
    repMax: row.repMax,
    targetRir: num(row.targetRir),
    restSec: row.restSec,
    supersetKey: row.supersetKey,
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function workoutToRow(row: Workout): WorkoutRow {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.title,
    startedAt: iso(row.startedAt),
    endedAt: isoOrNull(row.endedAt),
    localDate: localDate(row.localDate),
    timezone: row.timezone,
    bodyweightKg: num(row.bodyweightKg),
    isDeload: row.isDeload,
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function workoutExerciseToRow(row: WorkoutExercise): WorkoutExerciseRow {
  return {
    id: row.id,
    workoutId: row.workoutId,
    exerciseId: row.exerciseId,
    machineProfileId: row.machineProfileId,
    position: row.position,
    supersetKey: row.supersetKey,
    restSec: row.restSec,
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function workoutSetToRow(row: WorkoutSet): WorkoutSetRow {
  return {
    id: row.id,
    workoutExerciseId: row.workoutExerciseId,
    // server-derived
    workoutId: row.workoutId,
    exerciseId: row.exerciseId,
    machineProfileId: row.machineProfileId,
    seriesKey: row.seriesKey,
    localDate: localDate(row.localDate),
    effectiveLoadKg: num(row.effectiveLoadKg),
    e1rmKg: num(row.e1rmKg),
    // client-writable
    position: row.position,
    setType: row.setType,
    weightKg: num(row.weightKg),
    inputUnit: row.inputUnit,
    reps: row.reps,
    rir: num(row.rir),
    durationSec: row.durationSec,
    distanceM: num(row.distanceM),
    completedAt: isoOrNull(row.completedAt),
    notes: row.notes,
    ...syncMeta(row),
  };
}

export function personalRecordToRow(row: PersonalRecord): PersonalRecordRow {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    machineProfileId: row.machineProfileId,
    seriesKey: row.seriesKey,
    type: row.type,
    reps: row.reps,
    value: numRequired(row.value),
    previousValue: num(row.previousValue),
    setId: row.setId,
    workoutId: row.workoutId,
    achievedAt: iso(row.achievedAt),
  };
}

export function profileToRow(row: Profile): ProfileRow {
  return {
    sex: row.sex,
    birthDate: row.birthDate ? localDate(row.birthDate) : null,
    heightCm: num(row.heightCm),
    unitPreference: row.unitPreference,
    effortScale: row.effortScale,
    experience: row.experience,
    goal: row.goal,
    e1rmFormula: row.e1rmFormula,
    timezone: row.timezone,
    defaultRestSec: row.defaultRestSec,
    insightsEnabled: row.insightsEnabled,
    onboardedAt: isoOrNull(row.onboardedAt),
  };
}
