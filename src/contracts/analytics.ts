// Analytics contracts: input facts, results, and the signature of every analytics function.
// FROZEN after Phase 0. Pure TypeScript (no Prisma, no Decimal, no React).
//
// Implementations live in src/lib/analytics/** (stream D). Two are already implemented and tested in Phase 0:
//   estimate1RM  (src/lib/analytics/e1rm.ts)    effectiveLoadKg  (src/lib/analytics/load.ts)
// Everything else is a stub that throws `not implemented: <name>` until stream D delivers it; D must NOT change a
// signature (file a change request instead). The evidence behind every number is in docs/research.md.
import type { ExerciseMuscleEntry, LocalDateString } from "./entities";
import type {
  BodyFatMethod,
  E1rmFormula,
  Equipment,
  ExperienceLevel,
  LoadType,
  Mechanic,
  Modality,
  Muscle,
  SetType,
  Sex,
  StandardLift,
  TrackingType,
  TrainingGoal,
  WeightUnit,
} from "./enums";

// ───────────────────────────── shared input facts ─────────────────────────────

export interface ExerciseMeta {
  id: string;
  name: string;
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking: TrackingType;
  isUnilateral: boolean;
  bodyweightFactor: number | null;
  standardLift: StandardLift | null;
  mechanic: Mechanic | null;
  muscles: ExerciseMuscleEntry[];
}

export interface MachineProfileMeta {
  id: string;
  name: string;
  gymName: string | null;
  brand: string | null;
  exerciseId: string | null;
  labelUnit: WeightUnit | null;
  pinStepKg: number | null;
  baseLoadKg: number | null;
}

/** One COMPLETED, non-deleted set joined with the facts analytics needs (built by src/server/queries/facts.ts). */
export interface SetFact {
  id: string;
  workoutId: string;
  exerciseId: string;
  machineProfileId: string | null;
  seriesKey: string;
  localDate: LocalDateString;
  /** ISO instant the set was completed. */
  completedAt: string;
  setType: SetType;
  weightKg: number | null;
  effectiveLoadKg: number | null;
  reps: number | null;
  rir: number | null;
  durationSec: number | null;
  distanceM: number | null;
  e1rmKg: number | null;
  /** From the parent Workout: deload weeks are excluded from forecasts and stall detection. */
  isDeload: boolean;
  workoutBodyweightKg: number | null;
}

export interface ProfileFact {
  sex: Sex | null;
  birthDate: LocalDateString | null;
  ageYears: number | null;
  heightCm: number | null;
  experience: ExperienceLevel | null;
  goal: TrainingGoal | null;
  e1rmFormula: E1rmFormula;
  unitPreference: WeightUnit;
  timezone: string;
}

export interface BodyMetricFact {
  localDate: LocalDateString;
  weightKg: number | null;
  bodyFatPct: number | null;
  bodyFatMethod: BodyFatMethod | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
}

/** Everything the rule engine and the weekly-facts builder read. Assembled by loadAnalyticsInput() (frozen server query). */
export interface AnalyticsInput {
  /** The user's current local date (the "now" of every calculation; never read the system clock inside analytics). */
  today: LocalDateString;
  profile: ProfileFact;
  exercises: ExerciseMeta[];
  machineProfiles: MachineProfileMeta[];
  /** Completed sets over the lookback window (default 16 weeks), oldest first. */
  sets: SetFact[];
  /** Body metrics over the lookback window, oldest first. */
  bodyMetrics: BodyMetricFact[];
}

// ───────────────────────────── e1RM and effective load (IMPLEMENTED in Phase 0) ─────────────────────────────

export interface E1rmInput {
  weightKg: number;
  reps: number;
  /** Reps in reserve (folded into the estimate: reps + RIR). null/undefined = unknown = 0. */
  rir?: number | null;
  /** Default EPLEY. */
  formula?: E1rmFormula;
}

export interface E1rmEstimate {
  e1rmKg: number;
  /** "low" when reps + RIR > 10 (formulas degrade above 10; no estimate at all above 12). */
  confidence: "high" | "low";
  formula: E1rmFormula;
  /** reps + RIR actually used. */
  effectiveReps: number;
}

/**
 * Epley with RIR folded in: w * (1 + (reps + RIR) / 30). A single rep with no RIR returns the weight itself.
 * Returns null when reps + RIR > 12, reps < 1, or weight <= 0. Brzycki (36w / (37 - r)) is the alternative formula.
 * Result is rounded to 3 dp (the DB precision).
 */
export type Estimate1RM = (input: E1rmInput) => E1rmEstimate | null;

export interface EffectiveLoadInput {
  loadType: LoadType;
  /** The weight as entered, converted to kg. PLATES_PER_SIDE: the plates on ONE side. */
  weightKg: number | null;
  isUnilateral: boolean;
  /** The lifter's bodyweight at the time (Workout.bodyweightKg, else latest BodyMetric). Needed for BODYWEIGHT_PLUS. */
  bodyweightKg?: number | null;
  /** Exercise.bodyweightFactor; default 1 for BODYWEIGHT_PLUS. */
  bodyweightFactor?: number | null;
  /** MachineProfile.baseLoadKg: sled/carriage weight for PLATES_PER_SIDE. Default 0. */
  baseLoadKg?: number | null;
}

/**
 * TOTAL: weight. PER_IMPLEMENT: weight x 2 (x1 if unilateral). PLATES_PER_SIDE: 2 x weight + baseLoad.
 * STACK: the stack number. BODYWEIGHT_PLUS: bodyweight x factor + added weight (null if bodyweight unknown).
 * NONE: null. Result rounded to 3 dp.
 */
export type EffectiveLoadKg = (input: EffectiveLoadInput) => number | null;

// ───────────────────────────── volume ─────────────────────────────

export interface VolumeBand {
  /** Fractional sets per week. */
  low: number;
  high: number;
}

export type VolumeStatus = "none" | "below" | "within" | "above";

export interface MuscleVolume {
  muscle: Muscle;
  /** primary 1.0 + secondary 0.5 per hard set. Machine sets count fully. */
  fractionalSets: number;
  hardSets: number;
  directSets: number;
  indirectSets: number;
  band: VolumeBand;
  status: VolumeStatus;
}

export interface WeeklyVolumeInput {
  sets: SetFact[];
  exercises: ExerciseMeta[];
  /** Monday of the ISO week to summarize. Only sets with localDate in [weekStart, weekStart + 6] count. */
  weekStart: LocalDateString;
  goal: TrainingGoal | null;
}

/** A hard set is a completed set that is not a warm-up, with RIR <= 4 or RIR not recorded. */
export type IsHardSet = (set: Pick<SetFact, "setType" | "rir" | "reps" | "durationSec">) => boolean;

/** One entry per muscle that has any volume, ordered by fractionalSets descending. Volume does not depend on set order. */
export type WeeklyMuscleVolume = (input: WeeklyVolumeInput) => MuscleVolume[];

// ───────────────────────────── per-session series and forecast ─────────────────────────────

export interface SessionPoint {
  localDate: LocalDateString;
  /** Best e1RM of that session for the series, from working sets of 10 reps or fewer. */
  e1rmKg: number;
  seriesKey: string;
  isDeload: boolean;
}

/** Best e1RM per session (localDate) for ONE series, from non-warm-up, non-drop sets with <= 10 reps. Oldest first. */
export type SessionBestE1rm = (sets: SetFact[], opts?: { formula?: E1rmFormula }) => SessionPoint[];

export interface ForecastInput {
  /** Output of SessionBestE1rm for one series. */
  points: SessionPoint[];
  sex: Sex | null;
  experience: ExperienceLevel | null;
  standardLift: StandardLift | null;
  /** Date of the user's first logged workout, used to derive t0 when experience is unknown. */
  firstWorkoutDate: LocalDateString | null;
  today: LocalDateString;
  /** 1..12, default 12. */
  horizonWeeks?: number;
}

export interface ForecastPoint {
  localDate: LocalDateString;
  /** Median forecast e1RM (kg). */
  p50: number;
  /** 50% credible band. */
  low50: number;
  high50: number;
  /** 80% credible band. */
  low80: number;
  high80: number;
}

export interface ForecastModel {
  /** y = intercept + slope * ln(weeksSinceFirst + t0Weeks) */
  intercept: number;
  slope: number;
  t0Weeks: number;
  sigmaKg: number;
  /** Sessions actually used after excluding deloads, outliers (> 3 MAD) and pre-layoff data. */
  usedSessions: number;
  excluded: { deload: number; outliers: number; beforeLayoff: number };
}

export type ForecastInsufficientReason = "sessions" | "span" | "layoff";

export type ForecastResult =
  | { status: "ok"; points: ForecastPoint[]; model: ForecastModel }
  | { status: "insufficient"; reason: ForecastInsufficientReason; haveSessions: number; haveWeeks: number; needSessions: 6; needWeeks: 3 };

/**
 * Bayesian linear regression on ln(t + t0) with population priors by sex/lift/training age; noise sigma ~ 5% of e1RM.
 * Needs >= 6 sessions over >= 3 weeks. Horizon <= 12 weeks with 50% and 80% bands. Fit resets after a >= 4-week layoff.
 */
export type ForecastE1rm = (input: ForecastInput) => ForecastResult;

// ───────────────────────────── stall / progression ─────────────────────────────

export interface StallResult {
  stalled: boolean;
  /** Sessions considered (non-deload). */
  sessions: number;
  weeksSpanned: number;
  /** Relative change of recent best e1RM vs the earlier window; a change under ~5% is noise. */
  changePct: number | null;
}

/** A change smaller than ~5% is treated as noise (1RM test-retest CV is ~4%). */
export type DetectStall = (points: SessionPoint[], today: LocalDateString) => StallResult;

export interface ProgressionInput {
  /** Completed working sets of the series, most recent sessions last (at least the last 2 sessions). */
  sets: SetFact[];
  repMin: number;
  repMax: number;
  modality: Modality;
  /** Smallest load jump available (plates, or the machine's pin step). */
  incrementKg: number;
  /** Machine stack jumps can exceed 10%: when incrementKg / current load > 0.10, add reps first. */
  currentLoadKg: number;
}

export interface ProgressionSuggestion {
  kind: "add_load" | "add_reps" | "hold";
  nextLoadKg: number | null;
  nextRepTarget: number | null;
  rationale: string;
}

/** Double progression with the 2-for-2 rule: add load when the last set beats the target by 2 reps in two sessions in a row. */
export type SuggestProgression = (input: ProgressionInput) => ProgressionSuggestion;

// ───────────────────────────── body metrics / strength scores ─────────────────────────────

/** DOTS points. PREFER_NOT_TO_SAY -> averaged male/female coefficients. Clamps bodyweight (men 40-210, women 40-150). */
export type Dots = (input: { totalKg: number; bodyweightKg: number; sex: Sex }) => number | null;

/** IPF GL points (classic, raw by default). Check value: 90 kg bodyweight, 700 kg total, male -> 93.06. */
export type IpfGl = (input: { totalKg: number; bodyweightKg: number; sex: Sex; equipped?: boolean }) => number | null;

/** Allometric relative strength: lift / bodyweight^0.67. */
export type Allometric = (input: { liftKg: number; bodyweightKg: number }) => number;

export interface FfmiResult {
  leanMassKg: number;
  ffmi: number;
  normalizedFfmi: number;
  /** Because body-fat error carries through: FFMI at (bodyFat + 4) and (bodyFat - 4) percentage points. */
  range: { low: number; high: number };
}

/** LBM = BW(1 - BF%), FFMI = LBM / h^2, normalized = FFMI + 6.1 (1.8 - h). h in metres. */
export type Ffmi = (input: { weightKg: number; heightCm: number; bodyFatPct: number }) => FfmiResult;

/** US Navy tape estimate (cm, log10). Women need hipCm. Returns null when inputs are impossible (waist <= neck, ...). */
export type NavyBodyFat = (input: {
  sex: Extract<Sex, "MALE" | "FEMALE">;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number | null;
}) => number | null;

export interface ResolvedBodyFat {
  pct: number;
  method: BodyFatMethod;
  localDate: LocalDateString;
}

/** Source priority: DEXA > BIA/CALIPERS > NAVY_TAPE (computed from tape) > SCALE; the BMI estimate is NEVER returned. */
export type ResolveBodyFat = (metrics: BodyMetricFact[], profile: Pick<ProfileFact, "sex" | "heightCm">) => ResolvedBodyFat | null;

export interface TrendPoint {
  localDate: LocalDateString;
  trendKg: number;
}

/** Time-decayed moving average of bodyweight (default half-life 7 days), one point per input date. */
export type BodyweightTrend = (points: { localDate: LocalDateString; weightKg: number }[], opts?: { halfLifeDays?: number }) => TrendPoint[];

export interface StrengthPercentile {
  /** 0-100. */
  percentile: number;
  /** Always name the comparison population, e.g. "StrengthLevel, male, 85 kg bodyweight". */
  population: string;
  source: string;
}

/** Only barbell squat/bench/deadlift (and the standard lifts with norms). null for machines, unknown sex, PREFER_NOT_TO_SAY. */
export type StrengthPercentileFn = (input: {
  standardLift: StandardLift;
  e1rmKg: number;
  bodyweightKg: number;
  sex: Sex;
  ageYears: number | null;
}) => StrengthPercentile | null;

// ───────────────────────────── insights (rule engine) ─────────────────────────────

export const INSIGHT_RULE_IDS = [
  "volume-band", // 1. volume below the floor / above the ceiling
  "stalled-lift", // 2. stalled lift: deload, change variation or rep range
  "double-progression", // 3. 2-for-2 nudge (machines with big stack jumps: add reps first)
  "effort-check", // 4. typical RIR >= 4
  "frequency-session-cap", // 5. frequency and per-session cap (cap is from a preprint and labelled so)
  "rep-range-goal", // 6. rep range doesn't match the goal
  "relative-strength-percentile", // 7. names the comparison population
  "on-track-vs-population", // 8. only when the 80% bands separate
  "ffmi-context", // 9.
  "cut-strength-drop", // 10. losing weight while strength drops (slow the cut; 1.6 g/kg protein)
  "weight-change-rate", // 11. rate of bodyweight change vs ~0.5-1 %/week (Helms 2014): too fast, on pace, stalled (FAT_LOSS)
] as const;
export type InsightRuleId = (typeof INSIGHT_RULE_IDS)[number];

export const INSIGHT_SEVERITIES = ["info", "suggestion", "warning", "celebration"] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

export interface InsightEvidence {
  label: string;
  value: string | number;
  unit?: string;
}

export interface InsightCard {
  /** Stable id: `insight:<ruleId>` or `insight:<ruleId>:<subject>` (seriesKey or muscle). Used as a factRef. */
  id: string;
  ruleId: InsightRuleId;
  severity: InsightSeverity;
  title: string;
  body: string;
  evidence: InsightEvidence[];
  /** Keys of CITATIONS (src/lib/analytics/constants.ts), which map to docs/research.md. */
  citations: string[];
  subject?: { seriesKey?: string; exerciseId?: string; muscle?: Muscle };
}

/** Run all eleven rules (each may emit 0..n cards). Deterministic: same input -> same cards in the same order. */
export type RunInsightRules = (input: AnalyticsInput) => InsightCard[];

/** One rule: a pure function from the shared input to cards. Rules are exported individually for unit tests. */
export type InsightRule = (input: AnalyticsInput) => InsightCard[];
