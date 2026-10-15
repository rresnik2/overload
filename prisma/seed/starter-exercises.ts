// Phase 0 starter catalog: 30 hand-classified exercises from free-exercise-db (vendored at prisma/data/free-exercise-db.json).
// Stream C replaces the seed with the full classifier (prisma/seed/catalog.ts + classify.ts + overrides.json) over all 876 rows;
// these 30 are also a good start for C's hand-labelled test set. Ids come from the dataset, never invented.
import type { ExerciseClassification, FreeExerciseDbRow } from "@/contracts/catalog";
import type { Equipment, ExperienceLevel, ExerciseCategory, Force, LoadType, Mechanic, Modality, Muscle, StandardLift, TrackingType } from "@/contracts/enums";
import { slugify } from "@/lib/ids";

interface Label {
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  bodyweightFactor?: number;
  isUnilateral?: boolean;
  standardLift?: StandardLift;
  tracking?: TrackingType;
}

const FREE = (equipment: Equipment, loadType: LoadType = "TOTAL", extra: Partial<Label> = {}): Label => ({ modality: "FREE_WEIGHT", equipment, loadType, ...extra });
const DB: Label = { modality: "FREE_WEIGHT", equipment: "DUMBBELL", loadType: "PER_IMPLEMENT" };
const CABLE: Label = { modality: "CABLE", equipment: "CABLE", loadType: "STACK" };
const STACK: Label = { modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK" };
const PLATE: Label = { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" };

export const STARTER_LABELS: Record<string, Label> = {
  Barbell_Squat: FREE("BARBELL", "TOTAL", { standardLift: "SQUAT" }),
  "Barbell_Bench_Press_-_Medium_Grip": FREE("BARBELL", "TOTAL", { standardLift: "BENCH_PRESS" }),
  Barbell_Deadlift: FREE("BARBELL", "TOTAL", { standardLift: "DEADLIFT" }),
  Standing_Military_Press: FREE("BARBELL", "TOTAL", { standardLift: "OVERHEAD_PRESS" }),
  Bent_Over_Barbell_Row: FREE("BARBELL", "TOTAL", { standardLift: "BARBELL_ROW" }),
  Romanian_Deadlift: FREE("BARBELL"),
  Barbell_Curl: FREE("BARBELL"),
  Barbell_Hip_Thrust: FREE("BARBELL"),
  Incline_Dumbbell_Press: DB,
  Dumbbell_Bicep_Curl: DB,
  Dumbbell_Shoulder_Press: DB,
  Side_Lateral_Raise: DB,
  Dumbbell_Lunges: DB,
  Goblet_Squat: { modality: "FREE_WEIGHT", equipment: "KETTLEBELL", loadType: "TOTAL" }, // the dataset files it under kettlebells; one implement held: the entry IS the load
  Pullups: { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1, standardLift: "PULL_UP" },
  "Chin-Up": { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1 },
  "Dips_-_Triceps_Version": { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1, standardLift: "DIP" },
  Pushups: { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 0.64 },
  Plank: { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "NONE", tracking: "DURATION" },
  "Wide-Grip_Lat_Pulldown": CABLE,
  Seated_Cable_Rows: CABLE,
  Triceps_Pushdown: CABLE,
  Cable_Crossover: CABLE,
  Leg_Extensions: STACK,
  Lying_Leg_Curls: STACK,
  Seated_Leg_Curl: STACK,
  Leg_Press: PLATE,
  Hack_Squat: PLATE,
  Calf_Press_On_The_Leg_Press_Machine: PLATE,
  Leverage_Chest_Press: PLATE,
};

const MUSCLE: Record<string, Muscle> = {
  abdominals: "ABDOMINALS", abductors: "ABDUCTORS", adductors: "ADDUCTORS", biceps: "BICEPS", calves: "CALVES", chest: "CHEST",
  forearms: "FOREARMS", glutes: "GLUTES", hamstrings: "HAMSTRINGS", lats: "LATS", "lower back": "LOWER_BACK",
  "middle back": "MIDDLE_BACK", neck: "NECK", quadriceps: "QUADRICEPS", shoulders: "SHOULDERS", traps: "TRAPS", triceps: "TRICEPS",
};
const LEVEL: Record<string, ExperienceLevel> = { beginner: "BEGINNER", intermediate: "INTERMEDIATE", expert: "ADVANCED" };
const MECHANIC: Record<string, Mechanic> = { compound: "COMPOUND", isolation: "ISOLATION" };
const FORCE: Record<string, Force> = { push: "PUSH", pull: "PULL", static: "STATIC" };
const CATEGORY: Record<string, ExerciseCategory> = {
  strength: "STRENGTH", stretching: "STRETCHING", plyometrics: "PLYOMETRICS", strongman: "STRONGMAN",
  powerlifting: "POWERLIFTING", cardio: "CARDIO", "olympic weightlifting": "OLYMPIC_WEIGHTLIFTING",
};

/** Source row + hand label -> classification (the shape stream C's classify() must produce for all rows). */
export function classifyStarter(source: FreeExerciseDbRow, label: Label): ExerciseClassification {
  return {
    sourceId: source.id,
    slug: slugify(source.name),
    name: source.name,
    aliases: [],
    modality: label.modality,
    equipment: label.equipment,
    loadType: label.loadType,
    tracking: label.tracking ?? "LOAD_REPS",
    bodyweightFactor: label.bodyweightFactor ?? null,
    isUnilateral: label.isUnilateral ?? false,
    mechanic: source.mechanic ? MECHANIC[source.mechanic] ?? null : null,
    force: source.force ? FORCE[source.force] ?? null : null,
    level: LEVEL[source.level] ?? null,
    category: CATEGORY[source.category] ?? "STRENGTH",
    standardLift: label.standardLift ?? null,
    instructions: source.instructions,
    images: source.images,
    muscles: [
      ...source.primaryMuscles.map((m) => ({ muscle: MUSCLE[m] as Muscle, role: "PRIMARY" as const })),
      ...source.secondaryMuscles.map((m) => ({ muscle: MUSCLE[m] as Muscle, role: "SECONDARY" as const })),
    ].filter((m) => m.muscle),
  };
}
