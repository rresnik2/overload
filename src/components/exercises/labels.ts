// Display labels for catalog enums. PURE (no react, no server code): shared by the library, the detail page and E2's picker.
import type { Equipment, ExperienceLevel, ExerciseCategory, LoadType, Modality, Muscle, TrackingType } from "@/contracts/enums";

export const MODALITY_LABEL: Record<Modality, string> = {
  FREE_WEIGHT: "Free weight",
  MACHINE: "Machine",
  CABLE: "Cable",
  BODYWEIGHT: "Bodyweight",
  BAND: "Band",
  OTHER: "Other",
};

/** Library tab order. Free weight, Machine, Cable and Bodyweight first; Band and Other keep every exercise reachable. */
export const MODALITY_ORDER: readonly Modality[] = ["FREE_WEIGHT", "MACHINE", "CABLE", "BODYWEIGHT", "BAND", "OTHER"];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  BARBELL: "Barbell",
  DUMBBELL: "Dumbbell",
  KETTLEBELL: "Kettlebell",
  EZ_BAR: "EZ bar",
  TRAP_BAR: "Trap bar",
  PLATE: "Plate",
  MEDICINE_BALL: "Medicine ball",
  SMITH_MACHINE: "Smith machine",
  MACHINE_SELECTORIZED: "Selectorized machine",
  MACHINE_PLATE_LOADED: "Plate-loaded machine",
  CABLE: "Cable",
  BODYWEIGHT: "Bodyweight",
  BAND: "Band",
  EXERCISE_BALL: "Exercise ball",
  FOAM_ROLL: "Foam roll",
  OTHER: "Other",
};

export const LOAD_TYPE_LABEL: Record<LoadType, string> = {
  TOTAL: "Total weight",
  PER_IMPLEMENT: "Per dumbbell",
  PLATES_PER_SIDE: "Plates per side",
  STACK: "Weight stack",
  BODYWEIGHT_PLUS: "Bodyweight + added",
  NONE: "No load",
};

/** What the number a lifter logs means for this exercise (shown on the detail page). */
export const LOAD_TYPE_HELP: Record<LoadType, string> = {
  TOTAL: "Log the total weight you lift (bar and plates, or the single weight you hold).",
  PER_IMPLEMENT: "Log the weight of one dumbbell or kettlebell. A pair counts double; one-arm moves count once.",
  PLATES_PER_SIDE: "Log the plate weight on one side. The machine's own base load is added when it is known.",
  STACK: "Log the number on the weight stack. It is never converted to or compared with free weights.",
  BODYWEIGHT_PLUS: "Your bodyweight counts toward the load; log any weight you add on top (0 for none).",
  NONE: "There is no weight to log.",
};

export const TRACKING_LABEL: Record<TrackingType, string> = {
  LOAD_REPS: "Load and reps",
  REPS: "Reps",
  DURATION: "Duration",
  DISTANCE_DURATION: "Distance and time",
};

export const MUSCLE_LABEL: Record<Muscle, string> = {
  ABDOMINALS: "Abdominals",
  ABDUCTORS: "Abductors",
  ADDUCTORS: "Adductors",
  BICEPS: "Biceps",
  CALVES: "Calves",
  CHEST: "Chest",
  FOREARMS: "Forearms",
  GLUTES: "Glutes",
  HAMSTRINGS: "Hamstrings",
  LATS: "Lats",
  LOWER_BACK: "Lower back",
  MIDDLE_BACK: "Middle back",
  NECK: "Neck",
  QUADRICEPS: "Quadriceps",
  SHOULDERS: "Shoulders",
  TRAPS: "Traps",
  TRICEPS: "Triceps",
};

export const LEVEL_LABEL: Record<ExperienceLevel, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
};

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  STRENGTH: "Strength",
  POWERLIFTING: "Powerlifting",
  OLYMPIC_WEIGHTLIFTING: "Olympic weightlifting",
  STRONGMAN: "Strongman",
  PLYOMETRICS: "Plyometrics",
  STRETCHING: "Stretching",
  CARDIO: "Cardio",
};

/** Meta-line parts for PageHeader: ["Free weight", "Barbell"]. Collapses "Cable / Cable" to "Cable". */
export function exerciseMetaParts(exercise: { modality: Modality; equipment: Equipment }): string[] {
  const modality = MODALITY_LABEL[exercise.modality];
  const equipment = EQUIPMENT_LABEL[exercise.equipment];
  return modality === equipment ? [modality] : [modality, equipment];
}
