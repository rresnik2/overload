// Tiny, hand-written, typed example payloads for every contract. FROZEN after Phase 0.
// Use them in tests and as the reference for payload shapes. (Stream D owns the big generated lifter history in
// src/lib/fixtures/**; these are deliberately minimal.) Every value here is validated by contracts.test.ts.
import type { AnalyticsInput } from "./analytics";
import type {
  BodyMetricRow,
  ExerciseRow,
  MachineProfileRow,
  SyncMeta,
  TemplateExerciseRow,
  TemplateRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "./entities";
import { INSIGHT_FACTS_VERSION, type InsightFacts, type InsightNarrative } from "./insights";
import type { SyncRequest, SyncResponse } from "./sync";
import { emptyChanges } from "./sync";

export const FIXTURE_IDS = {
  deviceId: "dev1a2b3",
  exerciseSquat: "83a024cb-efa6-5b1b-8cef-e115a267bd5b", // catalogExerciseId("Barbell_Squat")
  exerciseLegPress: "0192a5b0-0001-7000-8000-000000000001", // a custom exercise
  machineProfile: "0192a5b0-0002-7000-8000-000000000001",
  template: "0192a5b0-0003-7000-8000-000000000001",
  templateExercise: "0192a5b0-0004-7000-8000-000000000001",
  workout: "0192a5b0-0005-7000-8000-000000000001",
  workoutExercise: "0192a5b0-0006-7000-8000-000000000001",
  workoutSet: "0192a5b0-0007-7000-8000-000000000001",
  bodyMetric: "0192a5b0-0008-7000-8000-000000000001",
  mutation: "0192a5b0-0009-7000-8000-000000000001",
} as const;

export const FIXTURE_HLC = "001791990000000-00000-dev1a2b3";
export const FIXTURE_HLC_LATER = "001791990005000-00000-dev1a2b3";

const meta = (overrides: Partial<SyncMeta> = {}): SyncMeta => ({
  hlc: FIXTURE_HLC,
  fieldHlc: {},
  version: 12,
  deletedAt: null,
  createdAt: "2026-10-12T17:00:00.000Z",
  updatedAt: "2026-10-12T17:00:00.000Z",
  ...overrides,
});

export const exampleCatalogExerciseRow: ExerciseRow = {
  id: FIXTURE_IDS.exerciseSquat,
  isCustom: false,
  sourceId: "Barbell_Squat",
  slug: "barbell-squat",
  name: "Barbell Squat",
  aliases: ["Back Squat"],
  modality: "FREE_WEIGHT",
  equipment: "BARBELL",
  loadType: "TOTAL",
  tracking: "LOAD_REPS",
  bodyweightFactor: null,
  isUnilateral: false,
  mechanic: "COMPOUND",
  force: "PUSH",
  level: "INTERMEDIATE",
  category: "POWERLIFTING",
  standardLift: "SQUAT",
  instructions: ["Set the bar on your upper back.", "Squat to depth and stand up."],
  images: ["Barbell_Squat/0.jpg", "Barbell_Squat/1.jpg"],
  muscles: [
    { muscle: "QUADRICEPS", role: "PRIMARY" },
    { muscle: "GLUTES", role: "SECONDARY" },
  ],
  ...meta({ hlc: "", version: 0 }),
};

export const exampleMachineProfileRow: MachineProfileRow = {
  id: FIXTURE_IDS.machineProfile,
  name: "Leg press (Downtown gym)",
  gymName: "Downtown gym",
  brand: "Hammer Strength",
  exerciseId: FIXTURE_IDS.exerciseLegPress,
  labelUnit: "LB",
  pinStepKg: null,
  baseLoadKg: 50,
  platesKg: null,
  notes: null,
  ...meta(),
};

export const exampleBodyMetricRow: BodyMetricRow = {
  id: FIXTURE_IDS.bodyMetric,
  measuredAt: "2026-10-12T07:30:00.000Z",
  localDate: "2026-10-12",
  weightKg: 82.4,
  bodyFatPct: 16.5,
  bodyFatMethod: "NAVY_TAPE",
  neckCm: 39,
  waistCm: 86,
  hipCm: null,
  chestCm: null,
  armCm: null,
  thighCm: null,
  calfCm: null,
  notes: null,
  ...meta(),
};

export const exampleTemplateRow: TemplateRow = {
  id: FIXTURE_IDS.template,
  name: "Lower A",
  notes: null,
  folder: null,
  position: "a0",
  ...meta(),
};

export const exampleTemplateExerciseRow: TemplateExerciseRow = {
  id: FIXTURE_IDS.templateExercise,
  templateId: FIXTURE_IDS.template,
  exerciseId: FIXTURE_IDS.exerciseSquat,
  machineProfileId: null,
  position: "a0",
  warmupSets: 2,
  workingSets: 3,
  repMin: 5,
  repMax: 8,
  targetRir: 2,
  restSec: 180,
  supersetKey: null,
  notes: null,
  ...meta(),
};

export const exampleWorkoutRow: WorkoutRow = {
  id: FIXTURE_IDS.workout,
  templateId: FIXTURE_IDS.template,
  title: "Lower A",
  startedAt: "2026-10-12T17:00:00.000Z",
  endedAt: "2026-10-12T18:05:00.000Z",
  localDate: "2026-10-12",
  timezone: "America/New_York",
  bodyweightKg: 82.4,
  isDeload: false,
  notes: null,
  ...meta(),
};

export const exampleWorkoutExerciseRow: WorkoutExerciseRow = {
  id: FIXTURE_IDS.workoutExercise,
  workoutId: FIXTURE_IDS.workout,
  exerciseId: FIXTURE_IDS.exerciseSquat,
  machineProfileId: null,
  position: "a0",
  supersetKey: null,
  restSec: 180,
  notes: null,
  ...meta(),
};

export const exampleWorkoutSetRow: WorkoutSetRow = {
  id: FIXTURE_IDS.workoutSet,
  workoutExerciseId: FIXTURE_IDS.workoutExercise,
  workoutId: FIXTURE_IDS.workout,
  exerciseId: FIXTURE_IDS.exerciseSquat,
  machineProfileId: null,
  seriesKey: FIXTURE_IDS.exerciseSquat,
  localDate: "2026-10-12",
  effectiveLoadKg: 140,
  e1rmKg: 163.333,
  position: "a0",
  setType: "WORKING",
  weightKg: 140,
  inputUnit: "KG",
  reps: 5,
  rir: 2,
  durationSec: null,
  distanceM: null,
  completedAt: "2026-10-12T17:20:00.000Z",
  notes: null,
  ...meta({ fieldHlc: { weightKg: FIXTURE_HLC, reps: FIXTURE_HLC } }),
};

/** A push that creates a workout set and then edits its reps (second mutation wins by HLC). */
export const exampleSyncRequest: SyncRequest = {
  deviceId: FIXTURE_IDS.deviceId,
  cursor: 0,
  clientHlc: FIXTURE_HLC_LATER,
  mutations: [
    {
      mutationId: FIXTURE_IDS.mutation,
      entity: "workoutSet",
      id: FIXTURE_IDS.workoutSet,
      fields: {
        workoutExerciseId: FIXTURE_IDS.workoutExercise,
        position: "a0",
        setType: "WORKING",
        weightKg: 140,
        inputUnit: "KG",
        reps: 5,
        rir: 2,
        completedAt: "2026-10-12T17:20:00.000Z",
      },
      fieldHlc: {
        workoutExerciseId: FIXTURE_HLC,
        position: FIXTURE_HLC,
        setType: FIXTURE_HLC,
        weightKg: FIXTURE_HLC,
        inputUnit: FIXTURE_HLC,
        reps: FIXTURE_HLC,
        rir: FIXTURE_HLC,
        completedAt: FIXTURE_HLC,
      },
    },
    {
      mutationId: "0192a5b0-0009-7000-8000-000000000002",
      entity: "workoutSet",
      id: FIXTURE_IDS.workoutSet,
      fields: { reps: 6 },
      fieldHlc: { reps: FIXTURE_HLC_LATER },
    },
  ],
};

export const exampleSyncResponse: SyncResponse = {
  results: [
    { mutationId: FIXTURE_IDS.mutation, status: "applied" },
    { mutationId: "0192a5b0-0009-7000-8000-000000000002", status: "applied" },
  ],
  changes: { ...emptyChanges(), workoutSet: [exampleWorkoutSetRow] },
  newPrs: [],
  cursor: 12,
  hasMore: false,
  reset: false,
  serverTime: "2026-10-12T17:21:00.000Z",
  serverHlc: FIXTURE_HLC_LATER,
};

export const exampleInsightFacts: InsightFacts = {
  version: INSIGHT_FACTS_VERSION,
  weekStart: "2026-10-12",
  weekEnd: "2026-10-18",
  timezone: "America/New_York",
  displayUnit: "KG",
  lifter: {
    id: "lifter",
    sex: "MALE",
    ageYears: 34,
    heightCm: 180,
    experience: "INTERMEDIATE",
    goal: "HYPERTROPHY",
    bodyweightKg: 82.4,
    bodyFatPct: 16.5,
    weeksTraining: 120,
  },
  training: {
    id: "training",
    sessions: 4,
    trainingDays: ["2026-10-12", "2026-10-14", "2026-10-16", "2026-10-18"],
    completedSets: 62,
    hardSets: 48,
    volumeLoadKg: 21450,
    avgRir: 2.1,
    isDeloadWeek: false,
    sessionsPrevWeek: 4,
    hardSetsPrevWeek: 44,
  },
  volume: [
    {
      id: "volume:QUADRICEPS",
      muscle: "QUADRICEPS",
      fractionalSets: 12.5,
      priorWeekFractionalSets: 11,
      bandLow: 10,
      bandHigh: 20,
      status: "within",
    },
  ],
  lifts: [
    {
      id: `lift:${FIXTURE_IDS.exerciseSquat}`,
      seriesKey: FIXTURE_IDS.exerciseSquat,
      exerciseId: FIXTURE_IDS.exerciseSquat,
      name: "Barbell Squat",
      modality: "FREE_WEIGHT",
      machineLabel: null,
      standardLift: "SQUAT",
      e1rmKg: 163.3,
      e1rmChangePct4w: 2.4,
      bestSet: { weightKg: 140, reps: 5 },
      sessionsLast8w: 14,
      trend: "up",
      stalled: false,
      forecast: { horizonWeeks: 12, p50Kg: 170, low80Kg: 162, high80Kg: 178 },
    },
  ],
  prs: [
    {
      id: `pr:${FIXTURE_IDS.exerciseSquat}:E1RM:0`,
      seriesKey: FIXTURE_IDS.exerciseSquat,
      exerciseName: "Barbell Squat",
      type: "E1RM",
      reps: 0,
      value: 163.3,
      previousValue: 160,
      achievedOn: "2026-10-12",
    },
  ],
  body: {
    id: "body",
    weightKg: 82.4,
    weightTrendKg: 82.1,
    weightChangeKg4w: 0.4,
    bodyFatPct: 16.5,
    bodyFatMethod: "NAVY_TAPE",
    ffmi: 21.4,
    normalizedFfmi: 21.4,
  },
  insights: [
    {
      id: "insight:effort-check",
      ruleId: "effort-check",
      severity: "info",
      title: "Your sets sit close to failure",
      body: "Most working sets were logged at 1-3 reps in reserve, a good range for muscle growth.",
      evidence: [{ label: "Average RIR", value: 2.1 }],
      citations: ["robinson2024"],
    },
  ],
};

export const exampleInsightNarrative: InsightNarrative = {
  headline: "A steady week with a squat PR",
  summary: "You trained 4 times and set 48 hard sets. Squat e1RM rose to 163.3 kg.",
  sections: [
    {
      title: "Squat",
      body: "Your best set was 140 kg for 5 reps, an estimated 1RM of 163.3 kg.",
      factRefs: [`lift:${FIXTURE_IDS.exerciseSquat}`, `pr:${FIXTURE_IDS.exerciseSquat}:E1RM:0`],
    },
  ],
  actions: [{ text: "Keep the same weekly volume and add 2.5 kg once you reach 8 reps.", factRefs: ["volume:QUADRICEPS"] }],
};

/** Minimal AnalyticsInput: one lifter, one exercise, one completed set (stream D's generator builds real histories). */
export const exampleAnalyticsInput: AnalyticsInput = {
  today: "2026-10-14",
  profile: {
    sex: "MALE",
    birthDate: "1992-03-02",
    ageYears: 34,
    heightCm: 180,
    experience: "INTERMEDIATE",
    goal: "HYPERTROPHY",
    e1rmFormula: "EPLEY",
    unitPreference: "KG",
    timezone: "America/New_York",
  },
  exercises: [
    {
      id: FIXTURE_IDS.exerciseSquat,
      name: "Barbell Squat",
      modality: "FREE_WEIGHT",
      equipment: "BARBELL",
      loadType: "TOTAL",
      tracking: "LOAD_REPS",
      isUnilateral: false,
      bodyweightFactor: null,
      standardLift: "SQUAT",
      mechanic: "COMPOUND",
      muscles: exampleCatalogExerciseRow.muscles,
    },
  ],
  machineProfiles: [],
  sets: [
    {
      id: FIXTURE_IDS.workoutSet,
      workoutId: FIXTURE_IDS.workout,
      exerciseId: FIXTURE_IDS.exerciseSquat,
      machineProfileId: null,
      seriesKey: FIXTURE_IDS.exerciseSquat,
      localDate: "2026-10-12",
      completedAt: "2026-10-12T17:20:00.000Z",
      setType: "WORKING",
      weightKg: 140,
      effectiveLoadKg: 140,
      reps: 5,
      rir: 2,
      durationSec: null,
      distanceM: null,
      e1rmKg: 163.333,
      isDeload: false,
      workoutBodyweightKg: 82.4,
    },
  ],
  bodyMetrics: [
    {
      localDate: "2026-10-12",
      weightKg: 82.4,
      bodyFatPct: 16.5,
      bodyFatMethod: "NAVY_TAPE",
      neckCm: 39,
      waistCm: 86,
      hipCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      calfCm: null,
    },
  ],
};
