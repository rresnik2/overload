// The exercises the fixture lifters train. Ids are the catalog UUIDv5s of free-exercise-db ids (same as the seeded
// catalog), muscles come from that dataset (checked by exercises.test.ts), loadType/equipment from the starter labels.
import type { ExerciseMeta } from "@/contracts/analytics";
import { catalogExerciseId } from "@/lib/ids";

export type FixtureExerciseKey =
  | "squat" | "bench" | "row" | "ohp" | "inclineDb" | "legPress" | "legCurl" | "pullUp" | "curl";

export interface FixtureExercise {
  key: FixtureExerciseKey;
  /** free-exercise-db id. */
  sourceId: string;
  meta: ExerciseMeta;
}

const P = "PRIMARY" as const;
const S = "SECONDARY" as const;

function ex(key: FixtureExerciseKey, sourceId: string, name: string, rest: Omit<ExerciseMeta, "id" | "name">): FixtureExercise {
  return { key, sourceId, meta: { id: catalogExerciseId(sourceId), name, ...rest } };
}

const base = { tracking: "LOAD_REPS" as const, isUnilateral: false, bodyweightFactor: null, standardLift: null };

export const FIXTURE_EXERCISES: Record<FixtureExerciseKey, FixtureExercise> = {
  squat: ex("squat", "Barbell_Squat", "Barbell Squat", {
    ...base, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", standardLift: "SQUAT", mechanic: "COMPOUND",
    muscles: [{ muscle: "QUADRICEPS", role: P }, { muscle: "CALVES", role: S }, { muscle: "GLUTES", role: S }, { muscle: "HAMSTRINGS", role: S }, { muscle: "LOWER_BACK", role: S }],
  }),
  bench: ex("bench", "Barbell_Bench_Press_-_Medium_Grip", "Barbell Bench Press - Medium Grip", {
    ...base, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", standardLift: "BENCH_PRESS", mechanic: "COMPOUND",
    muscles: [{ muscle: "CHEST", role: P }, { muscle: "SHOULDERS", role: S }, { muscle: "TRICEPS", role: S }],
  }),
  row: ex("row", "Bent_Over_Barbell_Row", "Bent Over Barbell Row", {
    ...base, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", standardLift: "BARBELL_ROW", mechanic: "COMPOUND",
    muscles: [{ muscle: "MIDDLE_BACK", role: P }, { muscle: "BICEPS", role: S }, { muscle: "LATS", role: S }, { muscle: "SHOULDERS", role: S }],
  }),
  ohp: ex("ohp", "Standing_Military_Press", "Standing Military Press", {
    ...base, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", standardLift: "OVERHEAD_PRESS", mechanic: "COMPOUND",
    muscles: [{ muscle: "SHOULDERS", role: P }, { muscle: "TRICEPS", role: S }],
  }),
  inclineDb: ex("inclineDb", "Incline_Dumbbell_Press", "Incline Dumbbell Press", {
    ...base, modality: "FREE_WEIGHT", equipment: "DUMBBELL", loadType: "PER_IMPLEMENT", mechanic: "COMPOUND",
    muscles: [{ muscle: "CHEST", role: P }, { muscle: "SHOULDERS", role: S }, { muscle: "TRICEPS", role: S }],
  }),
  legPress: ex("legPress", "Leg_Press", "Leg Press", {
    ...base, modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE", mechanic: "COMPOUND",
    muscles: [{ muscle: "QUADRICEPS", role: P }, { muscle: "CALVES", role: S }, { muscle: "GLUTES", role: S }, { muscle: "HAMSTRINGS", role: S }],
  }),
  legCurl: ex("legCurl", "Lying_Leg_Curls", "Lying Leg Curls", {
    ...base, modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK", mechanic: "ISOLATION",
    muscles: [{ muscle: "HAMSTRINGS", role: P }],
  }),
  pullUp: ex("pullUp", "Pullups", "Pullups", {
    ...base, modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1, standardLift: "PULL_UP", mechanic: "COMPOUND",
    muscles: [{ muscle: "LATS", role: P }, { muscle: "BICEPS", role: S }, { muscle: "MIDDLE_BACK", role: S }],
  }),
  curl: ex("curl", "Barbell_Curl", "Barbell Curl", {
    ...base, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", mechanic: "ISOLATION",
    muscles: [{ muscle: "BICEPS", role: P }, { muscle: "FOREARMS", role: S }],
  }),
};

export const FIXTURE_EXERCISE_LIST: FixtureExercise[] = Object.values(FIXTURE_EXERCISES);
