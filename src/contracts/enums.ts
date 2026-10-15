// Mirrors of every Prisma enum, usable on the client (the Prisma client must never be imported outside src/server).
// FROZEN after Phase 0. A test (src/server/__tests__/enums-match-prisma.test.ts) fails if these drift from prisma/schema.prisma.
// Each enum is a const object (value namespace), a string-union type (same name) and a Zod schema (<name>Schema).
import { z } from "zod";

export const Sex = {
  MALE: "MALE",
  FEMALE: "FEMALE",
  PREFER_NOT_TO_SAY: "PREFER_NOT_TO_SAY", // formula coefficients; PREFER_NOT -> averaged coeffs, percentiles hidden
} as const;
export type Sex = (typeof Sex)[keyof typeof Sex];
export const sexSchema = z.enum(Sex);
export const SEX_VALUES = Object.values(Sex) as readonly Sex[];

export const WeightUnit = {
  KG: "KG",
  LB: "LB", // display/entry only; storage is kg
} as const;
export type WeightUnit = (typeof WeightUnit)[keyof typeof WeightUnit];
export const weightUnitSchema = z.enum(WeightUnit);
export const WEIGHT_UNIT_VALUES = Object.values(WeightUnit) as readonly WeightUnit[];

export const EffortScale = {
  RIR: "RIR",
  RPE: "RPE", // display only; stored as RIR (RPE = 10 - RIR)
} as const;
export type EffortScale = (typeof EffortScale)[keyof typeof EffortScale];
export const effortScaleSchema = z.enum(EffortScale);
export const EFFORT_SCALE_VALUES = Object.values(EffortScale) as readonly EffortScale[];

export const ExperienceLevel = {
  BEGINNER: "BEGINNER",
  INTERMEDIATE: "INTERMEDIATE",
  ADVANCED: "ADVANCED",
} as const;
export type ExperienceLevel = (typeof ExperienceLevel)[keyof typeof ExperienceLevel];
export const experienceLevelSchema = z.enum(ExperienceLevel);
export const EXPERIENCE_LEVEL_VALUES = Object.values(ExperienceLevel) as readonly ExperienceLevel[];

export const TrainingGoal = {
  HYPERTROPHY: "HYPERTROPHY",
  STRENGTH: "STRENGTH",
  GENERAL: "GENERAL",
  FAT_LOSS: "FAT_LOSS", // "Lose weight (keep muscle)"
} as const;
export type TrainingGoal = (typeof TrainingGoal)[keyof typeof TrainingGoal];
export const trainingGoalSchema = z.enum(TrainingGoal);
export const TRAINING_GOAL_VALUES = Object.values(TrainingGoal) as readonly TrainingGoal[];

export const BodyFatMethod = {
  SCALE: "SCALE",
  BIA: "BIA",
  DEXA: "DEXA",
  NAVY_TAPE: "NAVY_TAPE",
  CALIPERS: "CALIPERS",
  VISUAL: "VISUAL",
} as const;
export type BodyFatMethod = (typeof BodyFatMethod)[keyof typeof BodyFatMethod];
export const bodyFatMethodSchema = z.enum(BodyFatMethod);
export const BODY_FAT_METHOD_VALUES = Object.values(BodyFatMethod) as readonly BodyFatMethod[];

export const Modality = {
  FREE_WEIGHT: "FREE_WEIGHT",
  MACHINE: "MACHINE",
  CABLE: "CABLE",
  BODYWEIGHT: "BODYWEIGHT",
  BAND: "BAND",
  OTHER: "OTHER",
} as const;
export type Modality = (typeof Modality)[keyof typeof Modality];
export const modalitySchema = z.enum(Modality);
export const MODALITY_VALUES = Object.values(Modality) as readonly Modality[];

export const Equipment = {
  BARBELL: "BARBELL",
  DUMBBELL: "DUMBBELL",
  KETTLEBELL: "KETTLEBELL",
  EZ_BAR: "EZ_BAR",
  TRAP_BAR: "TRAP_BAR",
  PLATE: "PLATE",
  MEDICINE_BALL: "MEDICINE_BALL",
  SMITH_MACHINE: "SMITH_MACHINE",
  MACHINE_SELECTORIZED: "MACHINE_SELECTORIZED",
  MACHINE_PLATE_LOADED: "MACHINE_PLATE_LOADED",
  CABLE: "CABLE",
  BODYWEIGHT: "BODYWEIGHT",
  BAND: "BAND",
  EXERCISE_BALL: "EXERCISE_BALL",
  FOAM_ROLL: "FOAM_ROLL",
  OTHER: "OTHER",
} as const;
export type Equipment = (typeof Equipment)[keyof typeof Equipment];
export const equipmentSchema = z.enum(Equipment);
export const EQUIPMENT_VALUES = Object.values(Equipment) as readonly Equipment[];

export const LoadType = {
  TOTAL: "TOTAL",
  PER_IMPLEMENT: "PER_IMPLEMENT",
  PLATES_PER_SIDE: "PLATES_PER_SIDE",
  STACK: "STACK",
  BODYWEIGHT_PLUS: "BODYWEIGHT_PLUS",
  NONE: "NONE",
} as const;
export type LoadType = (typeof LoadType)[keyof typeof LoadType];
export const loadTypeSchema = z.enum(LoadType);
export const LOAD_TYPE_VALUES = Object.values(LoadType) as readonly LoadType[];

export const TrackingType = {
  LOAD_REPS: "LOAD_REPS",
  REPS: "REPS",
  DURATION: "DURATION",
  DISTANCE_DURATION: "DISTANCE_DURATION",
} as const;
export type TrackingType = (typeof TrackingType)[keyof typeof TrackingType];
export const trackingTypeSchema = z.enum(TrackingType);
export const TRACKING_TYPE_VALUES = Object.values(TrackingType) as readonly TrackingType[];

export const Mechanic = {
  COMPOUND: "COMPOUND",
  ISOLATION: "ISOLATION",
} as const;
export type Mechanic = (typeof Mechanic)[keyof typeof Mechanic];
export const mechanicSchema = z.enum(Mechanic);
export const MECHANIC_VALUES = Object.values(Mechanic) as readonly Mechanic[];

export const Force = {
  PUSH: "PUSH",
  PULL: "PULL",
  STATIC: "STATIC",
} as const;
export type Force = (typeof Force)[keyof typeof Force];
export const forceSchema = z.enum(Force);
export const FORCE_VALUES = Object.values(Force) as readonly Force[];

export const ExerciseCategory = {
  STRENGTH: "STRENGTH",
  POWERLIFTING: "POWERLIFTING",
  OLYMPIC_WEIGHTLIFTING: "OLYMPIC_WEIGHTLIFTING",
  STRONGMAN: "STRONGMAN",
  PLYOMETRICS: "PLYOMETRICS",
  STRETCHING: "STRETCHING",
  CARDIO: "CARDIO",
} as const;
export type ExerciseCategory = (typeof ExerciseCategory)[keyof typeof ExerciseCategory];
export const exerciseCategorySchema = z.enum(ExerciseCategory);
export const EXERCISE_CATEGORY_VALUES = Object.values(ExerciseCategory) as readonly ExerciseCategory[];

export const Muscle = {
  ABDOMINALS: "ABDOMINALS",
  ABDUCTORS: "ABDUCTORS",
  ADDUCTORS: "ADDUCTORS",
  BICEPS: "BICEPS",
  CALVES: "CALVES",
  CHEST: "CHEST",
  FOREARMS: "FOREARMS",
  GLUTES: "GLUTES",
  HAMSTRINGS: "HAMSTRINGS",
  LATS: "LATS",
  LOWER_BACK: "LOWER_BACK",
  MIDDLE_BACK: "MIDDLE_BACK",
  NECK: "NECK",
  QUADRICEPS: "QUADRICEPS",
  SHOULDERS: "SHOULDERS",
  TRAPS: "TRAPS",
  TRICEPS: "TRICEPS",
} as const;
export type Muscle = (typeof Muscle)[keyof typeof Muscle];
export const muscleSchema = z.enum(Muscle);
export const MUSCLE_VALUES = Object.values(Muscle) as readonly Muscle[];

export const MuscleRole = {
  PRIMARY: "PRIMARY", // weekly sets: 1.0
  SECONDARY: "SECONDARY", // weekly sets: 0.5
} as const;
export type MuscleRole = (typeof MuscleRole)[keyof typeof MuscleRole];
export const muscleRoleSchema = z.enum(MuscleRole);
export const MUSCLE_ROLE_VALUES = Object.values(MuscleRole) as readonly MuscleRole[];

export const StandardLift = {
  SQUAT: "SQUAT",
  BENCH_PRESS: "BENCH_PRESS",
  DEADLIFT: "DEADLIFT",
  OVERHEAD_PRESS: "OVERHEAD_PRESS",
  BARBELL_ROW: "BARBELL_ROW",
  PULL_UP: "PULL_UP",
  DIP: "DIP",
} as const;
export type StandardLift = (typeof StandardLift)[keyof typeof StandardLift];
export const standardLiftSchema = z.enum(StandardLift);
export const STANDARD_LIFT_VALUES = Object.values(StandardLift) as readonly StandardLift[];

export const SetType = {
  WARMUP: "WARMUP", // excluded from volume and PRs
  WORKING: "WORKING",
  DROP: "DROP", // excluded from e1RM and PRs
  AMRAP: "AMRAP",
} as const;
export type SetType = (typeof SetType)[keyof typeof SetType];
export const setTypeSchema = z.enum(SetType);
export const SET_TYPE_VALUES = Object.values(SetType) as readonly SetType[];

export const PrType = {
  E1RM: "E1RM",
  MAX_LOAD: "MAX_LOAD",
  REP_MAX: "REP_MAX",
  MAX_REPS: "MAX_REPS",
  MAX_SET_VOLUME: "MAX_SET_VOLUME",
  MAX_SESSION_VOLUME: "MAX_SESSION_VOLUME",
} as const;
export type PrType = (typeof PrType)[keyof typeof PrType];
export const prTypeSchema = z.enum(PrType);
export const PR_TYPE_VALUES = Object.values(PrType) as readonly PrType[];

export const E1rmFormula = {
  EPLEY: "EPLEY",
  BRZYCKI: "BRZYCKI",
} as const;
export type E1rmFormula = (typeof E1rmFormula)[keyof typeof E1rmFormula];
export const e1rmFormulaSchema = z.enum(E1rmFormula);
export const E1RM_FORMULA_VALUES = Object.values(E1rmFormula) as readonly E1rmFormula[];

export const InsightStatus = {
  PENDING: "PENDING",
  READY: "READY",
  FAILED: "FAILED",
} as const;
export type InsightStatus = (typeof InsightStatus)[keyof typeof InsightStatus];
export const insightStatusSchema = z.enum(InsightStatus);
export const INSIGHT_STATUS_VALUES = Object.values(InsightStatus) as readonly InsightStatus[];

export const InsightTrigger = {
  CRON: "CRON",
  ON_DEMAND: "ON_DEMAND",
} as const;
export type InsightTrigger = (typeof InsightTrigger)[keyof typeof InsightTrigger];
export const insightTriggerSchema = z.enum(InsightTrigger);
export const INSIGHT_TRIGGER_VALUES = Object.values(InsightTrigger) as readonly InsightTrigger[];

/** Every enum by name, for the schema-match test and generic UIs. */
export const ALL_ENUMS = { Sex, WeightUnit, EffortScale, ExperienceLevel, TrainingGoal, BodyFatMethod, Modality, Equipment, LoadType, TrackingType, Mechanic, Force, ExerciseCategory, Muscle, MuscleRole, StandardLift, SetType, PrType, E1rmFormula, InsightStatus, InsightTrigger } as const;
