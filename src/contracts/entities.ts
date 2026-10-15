// Entity contracts: Row (what the server returns / Dexie stores), Fields/Create/Patch (what a client may write).
// FROZEN after Phase 0. Pure TypeScript + Zod (no Prisma, no Decimal, no React).
//
// Conventions (see CONTRACTS.md):
//  - Rows carry NO `userId` (the client database is per user; the server derives the user from the session).
//  - kg/cm/%-valued columns are plain `number`s (Decimal never leaves src/server; mappers convert).
//  - Instants are ISO-8601 UTC strings ("2026-10-14T18:03:22.123Z"); calendar dates are "YYYY-MM-DD".
//  - Every Fields schema is `z.strictObject`: unknown keys (userId, version, hlc, fieldHlc, effectiveLoadKg, e1rmKg, ...)
//    FAIL validation instead of being silently stripped. That is how "never accepted from the client" is enforced.
import { z } from "zod";
import {
  bodyFatMethodSchema,
  equipmentSchema,
  e1rmFormulaSchema,
  effortScaleSchema,
  exerciseCategorySchema,
  experienceLevelSchema,
  forceSchema,
  loadTypeSchema,
  mechanicSchema,
  modalitySchema,
  muscleRoleSchema,
  muscleSchema,
  setTypeSchema,
  sexSchema,
  standardLiftSchema,
  trackingTypeSchema,
  trainingGoalSchema,
  weightUnitSchema,
  type E1rmFormula,
  type EffortScale,
  type ExperienceLevel,
  type PrType,
  type Sex,
  type TrainingGoal,
  type WeightUnit,
} from "./enums";

// ───────────────────────────── primitives ─────────────────────────────

export type Uuid = string;
/** ISO-8601 UTC instant, e.g. "2026-10-14T18:03:22.123Z". */
export type IsoDateTime = string;
/** Calendar date "YYYY-MM-DD" (Workout.localDate etc.). */
export type LocalDateString = string;

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime();
export const localDateSchema = z.iso.date();
/** Fractional-index key (npm `fractional-indexing`) used for ordering: Template.position, WorkoutSet.position, ... */
export const positionSchema = z.string().min(1).max(64);

const text = (max = 200) => z.string().trim().min(1).max(max);
const optText = (max = 2000) => z.string().trim().max(max).nullable().default(null);
const optNum = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null);
const optInt = (min: number, max: number) => z.int().min(min).max(max).nullable().default(null);

type PatchShape<T extends z.ZodRawShape> = {
  [K in keyof T]: T[K] extends z.ZodDefault<infer Inner> ? z.ZodOptional<Inner> : z.ZodOptional<T[K]>;
};

/**
 * Build the Patch schema from a Fields schema: every key optional, and `.default()`s are REMOVED.
 * (Zod's own `.partial()` keeps defaults, which would silently overwrite untouched fields with defaults
 * when a patch is parsed. Never use `.partial()` on a Fields schema.)
 */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>): z.ZodObject<PatchShape<T>, z.core.$strict> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, value] of Object.entries(schema.shape)) {
    shape[key] = (value instanceof z.ZodDefault ? (value.unwrap() as z.ZodType) : (value as z.ZodType)).optional();
  }
  return z.strictObject(shape) as unknown as z.ZodObject<PatchShape<T>, z.core.$strict>;
}

/** Sync mixin columns carried by every synced Row. */
export interface SyncMeta {
  /** Hybrid logical clock of the row's latest write (HLC string, see src/contracts/sync.ts). "" for catalog rows. */
  hlc: string;
  /** Per-field HLC: field name -> HLC of the write that last set it (last-write-wins per field). */
  fieldHlc: Record<string, string>;
  /** Per-user monotonically increasing change counter assigned by the server (the sync cursor). 0 = never synced / catalog. */
  version: number;
  /** Tombstone. Non-null = deleted (kept 90 days so other devices learn about it). */
  deletedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

// ───────────────────────────── Exercise ─────────────────────────────

export const exerciseMuscleEntrySchema = z.strictObject({ muscle: muscleSchema, role: muscleRoleSchema });
export type ExerciseMuscleEntry = z.infer<typeof exerciseMuscleEntrySchema>;

/** Client-writable fields of a CUSTOM exercise. (Catalog rows are read-only; they come from /api/catalog.) */
export const exerciseFieldsSchema = z.strictObject({
  slug: text(120),
  name: text(120),
  aliases: z.array(text(120)).max(20).default([]),
  modality: modalitySchema,
  equipment: equipmentSchema,
  loadType: loadTypeSchema,
  tracking: trackingTypeSchema.default("LOAD_REPS"),
  bodyweightFactor: optNum(0, 2),
  isUnilateral: z.boolean().default(false),
  mechanic: mechanicSchema.nullable().default(null),
  force: forceSchema.nullable().default(null),
  level: experienceLevelSchema.nullable().default(null),
  category: exerciseCategorySchema.default("STRENGTH"),
  standardLift: standardLiftSchema.nullable().default(null),
  instructions: z.array(z.string().trim().max(1000)).max(40).default([]),
  images: z.array(z.string().max(300)).max(10).default([]),
  /** Travels with the Exercise mutation (whole-array last-write-wins); the server materializes ExerciseMuscle rows. */
  muscles: z.array(exerciseMuscleEntrySchema).max(17).default([]),
});
export const exercisePatchSchema = patchOf(exerciseFieldsSchema);
export type ExerciseFields = z.output<typeof exerciseFieldsSchema>;
export type ExerciseCreate = z.input<typeof exerciseFieldsSchema>;
export type ExercisePatch = Partial<ExerciseCreate>;

export interface ExerciseRow extends ExerciseFields, SyncMeta {
  id: Uuid;
  /** false = global catalog row (read-only, version 0); true = the user's own custom exercise. */
  isCustom: boolean;
  /** free-exercise-db id for catalog rows, else null. */
  sourceId: string | null;
}

// ───────────────────────────── MachineProfile ─────────────────────────────

export const machineProfileFieldsSchema = z.strictObject({
  name: text(120),
  gymName: optText(120),
  brand: optText(120),
  exerciseId: uuidSchema.nullable().default(null),
  labelUnit: weightUnitSchema.nullable().default(null),
  pinStepKg: optNum(0, 100),
  baseLoadKg: optNum(0, 500),
  notes: optText(),
});
export const machineProfilePatchSchema = patchOf(machineProfileFieldsSchema);
export type MachineProfileFields = z.output<typeof machineProfileFieldsSchema>;
export type MachineProfileCreate = z.input<typeof machineProfileFieldsSchema>;
export type MachineProfilePatch = Partial<MachineProfileCreate>;
export interface MachineProfileRow extends MachineProfileFields, SyncMeta {
  id: Uuid;
}

// ───────────────────────────── ExerciseFavorite ─────────────────────────────

/**
 * A starred exercise (catalog or custom). The row id is NOT a client UUIDv7: it is favoriteId(userId, exerciseId)
 * (src/lib/ids.ts), so two offline devices that star the same exercise write the same row and converge through the
 * normal merge. `exerciseId` is therefore create-only in practice: changing it would change the id, and the server
 * rejects a row whose id is not favoriteId(user, exerciseId). Unfavorite = tombstone (`deletedAt`); favoriting again
 * is `deletedAt = null` with a newer HLC.
 */
export const exerciseFavoriteFieldsSchema = z.strictObject({
  exerciseId: uuidSchema,
  position: positionSchema,
});
export const exerciseFavoritePatchSchema = patchOf(exerciseFavoriteFieldsSchema);
export type ExerciseFavoriteFields = z.output<typeof exerciseFavoriteFieldsSchema>;
export type ExerciseFavoriteCreate = z.input<typeof exerciseFavoriteFieldsSchema>;
export type ExerciseFavoritePatch = Partial<ExerciseFavoriteCreate>;
export interface ExerciseFavoriteRow extends ExerciseFavoriteFields, SyncMeta {
  id: Uuid;
}

// ───────────────────────────── BodyMetric ─────────────────────────────

export const bodyMetricFieldsSchema = z.strictObject({
  measuredAt: isoDateTimeSchema,
  localDate: localDateSchema,
  weightKg: optNum(20, 500),
  bodyFatPct: optNum(1, 75),
  bodyFatMethod: bodyFatMethodSchema.nullable().default(null),
  neckCm: optNum(5, 300),
  waistCm: optNum(5, 300),
  hipCm: optNum(5, 300),
  chestCm: optNum(5, 300),
  armCm: optNum(5, 300),
  thighCm: optNum(5, 300),
  calfCm: optNum(5, 300),
  notes: optText(),
});
export const bodyMetricPatchSchema = patchOf(bodyMetricFieldsSchema);
export type BodyMetricFields = z.output<typeof bodyMetricFieldsSchema>;
export type BodyMetricCreate = z.input<typeof bodyMetricFieldsSchema>;
export type BodyMetricPatch = Partial<BodyMetricCreate>;
export interface BodyMetricRow extends BodyMetricFields, SyncMeta {
  id: Uuid;
}

// ───────────────────────────── Template / TemplateExercise ─────────────────────────────

export const templateFieldsSchema = z.strictObject({
  name: text(120),
  notes: optText(),
  folder: optText(120),
  position: positionSchema,
});
export const templatePatchSchema = patchOf(templateFieldsSchema);
export type TemplateFields = z.output<typeof templateFieldsSchema>;
export type TemplateCreate = z.input<typeof templateFieldsSchema>;
export type TemplatePatch = Partial<TemplateCreate>;
export interface TemplateRow extends TemplateFields, SyncMeta {
  id: Uuid;
}

export const templateExerciseFieldsSchema = z.strictObject({
  templateId: uuidSchema,
  exerciseId: uuidSchema,
  machineProfileId: uuidSchema.nullable().default(null),
  position: positionSchema,
  warmupSets: z.int().min(0).max(50).default(0),
  workingSets: z.int().min(0).max(50).default(3),
  repMin: optInt(1, 200),
  repMax: optInt(1, 200),
  targetRir: optNum(0, 10),
  restSec: optInt(0, 3600),
  supersetKey: z.string().max(32).nullable().default(null),
  notes: optText(),
});
export const templateExercisePatchSchema = patchOf(templateExerciseFieldsSchema);
export type TemplateExerciseFields = z.output<typeof templateExerciseFieldsSchema>;
export type TemplateExerciseCreate = z.input<typeof templateExerciseFieldsSchema>;
export type TemplateExercisePatch = Partial<TemplateExerciseCreate>;
export interface TemplateExerciseRow extends TemplateExerciseFields, SyncMeta {
  id: Uuid;
}

// ───────────────────────────── Workout / WorkoutExercise / WorkoutSet ─────────────────────────────

export const workoutFieldsSchema = z.strictObject({
  templateId: uuidSchema.nullable().default(null),
  title: z.string().trim().max(120).nullable().default(null),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable().default(null),
  /** The DEVICE's local date when the workout started. The only field used to group by day/week. */
  localDate: localDateSchema,
  /** IANA zone of the device when the workout started. */
  timezone: text(64),
  bodyweightKg: optNum(20, 500),
  isDeload: z.boolean().default(false),
  notes: optText(),
});
export const workoutPatchSchema = patchOf(workoutFieldsSchema);
export type WorkoutFields = z.output<typeof workoutFieldsSchema>;
export type WorkoutCreate = z.input<typeof workoutFieldsSchema>;
export type WorkoutPatch = Partial<WorkoutCreate>;
export interface WorkoutRow extends WorkoutFields, SyncMeta {
  id: Uuid;
}

export const workoutExerciseFieldsSchema = z.strictObject({
  workoutId: uuidSchema,
  exerciseId: uuidSchema,
  /** Required (by the UI) for MACHINE/CABLE exercises; keys the progression series. */
  machineProfileId: uuidSchema.nullable().default(null),
  position: positionSchema,
  supersetKey: z.string().max(32).nullable().default(null),
  restSec: optInt(0, 3600),
  notes: optText(),
});
export const workoutExercisePatchSchema = patchOf(workoutExerciseFieldsSchema);
export type WorkoutExerciseFields = z.output<typeof workoutExerciseFieldsSchema>;
export type WorkoutExerciseCreate = z.input<typeof workoutExerciseFieldsSchema>;
export type WorkoutExercisePatch = Partial<WorkoutExerciseCreate>;
export interface WorkoutExerciseRow extends WorkoutExerciseFields, SyncMeta {
  id: Uuid;
}

/** Client-writable set fields. Denormalized FKs, seriesKey, localDate, effectiveLoadKg and e1rmKg are NOT here on purpose. */
export const workoutSetFieldsSchema = z.strictObject({
  workoutExerciseId: uuidSchema,
  position: positionSchema,
  setType: setTypeSchema.default("WORKING"),
  weightKg: optNum(0, 9999.999),
  /** The unit the user typed, so pound entries display exactly as entered. */
  inputUnit: weightUnitSchema.nullable().default(null),
  reps: optInt(0, 1000),
  /** Reps in reserve (RPE = 10 - RIR). Decimal(3,1). */
  rir: optNum(0, 10),
  durationSec: optInt(0, 86_400),
  distanceM: optNum(0, 1_000_000),
  /** null = planned (not yet done). */
  completedAt: isoDateTimeSchema.nullable().default(null),
  notes: optText(),
});
export const workoutSetPatchSchema = patchOf(workoutSetFieldsSchema);
export type WorkoutSetFields = z.output<typeof workoutSetFieldsSchema>;
export type WorkoutSetCreate = z.input<typeof workoutSetFieldsSchema>;
export type WorkoutSetPatch = Partial<WorkoutSetCreate>;

/** Columns the SERVER derives (and the client repo mirrors locally for offline reads; the server's values win on pull). */
export interface WorkoutSetDerived {
  workoutId: Uuid;
  exerciseId: Uuid;
  machineProfileId: Uuid | null;
  /** exerciseId, or `${exerciseId}:${machineProfileId}`; see seriesKey() in src/lib/ids.ts. */
  seriesKey: string;
  localDate: LocalDateString;
  /** Effective load (kg) after load-type rules, via effectiveLoadKg() in src/lib/analytics/load.ts. */
  effectiveLoadKg: number | null;
  /** Estimated 1RM (kg) via estimate1RM() in src/lib/analytics/e1rm.ts. null when not estimable. */
  e1rmKg: number | null;
}
export interface WorkoutSetRow extends WorkoutSetFields, WorkoutSetDerived, SyncMeta {
  id: Uuid;
}

// ───────────────────────────── server-derived / user-level (never client-written) ─────────────────────────────

export interface PersonalRecordRow {
  id: Uuid;
  exerciseId: Uuid;
  machineProfileId: Uuid | null;
  seriesKey: string;
  type: PrType;
  /** 0 for non-rep-specific types (E1RM, MAX_LOAD, ...); the rep count for REP_MAX. */
  reps: number;
  value: number;
  previousValue: number | null;
  setId: Uuid | null;
  workoutId: Uuid;
  achievedAt: IsoDateTime;
}

/** Fields the Profile Server Actions may write (stream A). No userId: the action uses requireUser(). */
export const profileUpdateSchema = z.strictObject({
  sex: sexSchema.nullable().optional(),
  birthDate: localDateSchema.nullable().optional(),
  heightCm: z.number().min(50).max(260).nullable().optional(),
  unitPreference: weightUnitSchema.optional(),
  effortScale: effortScaleSchema.optional(),
  experience: experienceLevelSchema.nullable().optional(),
  goal: trainingGoalSchema.nullable().optional(),
  e1rmFormula: e1rmFormulaSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  defaultRestSec: z.int().min(0).max(3600).optional(),
  insightsEnabled: z.boolean().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface ProfileRow {
  sex: Sex | null;
  birthDate: LocalDateString | null;
  heightCm: number | null;
  unitPreference: WeightUnit;
  effortScale: EffortScale;
  experience: ExperienceLevel | null;
  goal: TrainingGoal | null;
  e1rmFormula: E1rmFormula;
  timezone: string;
  defaultRestSec: number;
  insightsEnabled: boolean;
  onboardedAt: IsoDateTime | null;
}

// ───────────────────────────── entity registry (used by sync + repo) ─────────────────────────────

/** The 9 synced entities. Order = a valid dependency order (parents before children); see SYNC_ORDER. */
export const ENTITY_NAMES = [
  "exercise",
  "machineProfile",
  "bodyMetric",
  "template",
  "templateExercise",
  "workout",
  "workoutExercise",
  "workoutSet",
  "exerciseFavorite",
] as const;
export type EntityName = (typeof ENTITY_NAMES)[number];
export const SYNC_ORDER: readonly EntityName[] = ENTITY_NAMES;

export interface EntityTypeMap {
  exercise: { row: ExerciseRow; create: ExerciseCreate; patch: ExercisePatch };
  machineProfile: { row: MachineProfileRow; create: MachineProfileCreate; patch: MachineProfilePatch };
  bodyMetric: { row: BodyMetricRow; create: BodyMetricCreate; patch: BodyMetricPatch };
  template: { row: TemplateRow; create: TemplateCreate; patch: TemplatePatch };
  templateExercise: { row: TemplateExerciseRow; create: TemplateExerciseCreate; patch: TemplateExercisePatch };
  workout: { row: WorkoutRow; create: WorkoutCreate; patch: WorkoutPatch };
  workoutExercise: { row: WorkoutExerciseRow; create: WorkoutExerciseCreate; patch: WorkoutExercisePatch };
  workoutSet: { row: WorkoutSetRow; create: WorkoutSetCreate; patch: WorkoutSetPatch };
  exerciseFavorite: { row: ExerciseFavoriteRow; create: ExerciseFavoriteCreate; patch: ExerciseFavoritePatch };
}

/** Full-field (Create) schemas by entity: validates a brand-new row's writable fields. */
export const ENTITY_FIELDS_SCHEMAS = {
  exercise: exerciseFieldsSchema,
  machineProfile: machineProfileFieldsSchema,
  bodyMetric: bodyMetricFieldsSchema,
  template: templateFieldsSchema,
  templateExercise: templateExerciseFieldsSchema,
  workout: workoutFieldsSchema,
  workoutExercise: workoutExerciseFieldsSchema,
  workoutSet: workoutSetFieldsSchema,
  exerciseFavorite: exerciseFavoriteFieldsSchema,
} as const;

/** Partial (Patch) schemas by entity: validates a mutation against an existing row. */
export const ENTITY_PATCH_SCHEMAS = {
  exercise: exercisePatchSchema,
  machineProfile: machineProfilePatchSchema,
  bodyMetric: bodyMetricPatchSchema,
  template: templatePatchSchema,
  templateExercise: templateExercisePatchSchema,
  workout: workoutPatchSchema,
  workoutExercise: workoutExercisePatchSchema,
  workoutSet: workoutSetPatchSchema,
  exerciseFavorite: exerciseFavoritePatchSchema,
} as const;

/** Writable field names per entity (the keys of the Fields schema). `deletedAt` is additionally writable on every entity. */
export const ENTITY_WRITABLE_FIELDS: { [E in EntityName]: readonly string[] } = {
  exercise: Object.keys(exerciseFieldsSchema.shape),
  machineProfile: Object.keys(machineProfileFieldsSchema.shape),
  bodyMetric: Object.keys(bodyMetricFieldsSchema.shape),
  template: Object.keys(templateFieldsSchema.shape),
  templateExercise: Object.keys(templateExerciseFieldsSchema.shape),
  workout: Object.keys(workoutFieldsSchema.shape),
  workoutExercise: Object.keys(workoutExerciseFieldsSchema.shape),
  workoutSet: Object.keys(workoutSetFieldsSchema.shape),
  exerciseFavorite: Object.keys(exerciseFavoriteFieldsSchema.shape),
};

/** Foreign references the server must validate (same owner, not hard-missing) before applying a mutation. */
export interface EntityRef {
  field: string;
  entity: EntityName;
  required: boolean;
}
export const ENTITY_REFS: { [E in EntityName]: readonly EntityRef[] } = {
  exercise: [],
  machineProfile: [{ field: "exerciseId", entity: "exercise", required: false }],
  bodyMetric: [],
  template: [],
  templateExercise: [
    { field: "templateId", entity: "template", required: true },
    { field: "exerciseId", entity: "exercise", required: true },
    { field: "machineProfileId", entity: "machineProfile", required: false },
  ],
  workout: [{ field: "templateId", entity: "template", required: false }],
  workoutExercise: [
    { field: "workoutId", entity: "workout", required: true },
    { field: "exerciseId", entity: "exercise", required: true },
    { field: "machineProfileId", entity: "machineProfile", required: false },
  ],
  workoutSet: [{ field: "workoutExerciseId", entity: "workoutExercise", required: true }],
  exerciseFavorite: [{ field: "exerciseId", entity: "exercise", required: true }],
};

/** WorkoutSet columns the server derives; they must never be writable (see WorkoutSetDerived). */
export const WORKOUT_SET_DERIVED_FIELDS = [
  "workoutId",
  "exerciseId",
  "machineProfileId",
  "seriesKey",
  "localDate",
  "effectiveLoadKg",
  "e1rmKg",
] as const;

/** Fields that must NEVER appear in anything a client sends (checked by src/contracts/no-forbidden-fields.test.ts). */
export const SERVER_OWNED_FIELDS = [
  "userId",
  "version",
  "hlc",
  "fieldHlc",
  "createdAt",
  "updatedAt",
  "effectiveLoadKg",
  "e1rmKg",
  "seriesKey",
  "isCustom",
  "sourceId",
] as const;
