// What a logged number means, per LoadType / TrackingType / SetType. PURE (no react): used by SetRow, the picker and tests.
import type { ExerciseRow } from "@/contracts/entities";
import type { EffortScale, SetType, TrackingType, WeightUnit } from "@/contracts/enums";

export interface LoadLabel {
  /** Short qualifier shown next to the unit: "per hand", "per side", "stack", "+ bodyweight", "total". */
  short: string;
  /** Sentence for screen readers and helper text. */
  help: string;
}

type LoadFacts = Pick<ExerciseRow, "loadType" | "equipment" | "isUnilateral">;

/** Label for the weight field of a set row. The wording follows the LoadType; PER_IMPLEMENT says "per hand". */
export function loadLabel(exercise: LoadFacts): LoadLabel {
  switch (exercise.loadType) {
    case "PER_IMPLEMENT":
      return { short: "per hand", help: exercise.isUnilateral ? "Weight of the one implement you hold." : "Weight of one dumbbell or kettlebell (a pair counts double)." };
    case "PLATES_PER_SIDE":
      return { short: "per side", help: "Plate weight on one side. The machine's base load is added when known." };
    case "STACK":
      return { short: "stack", help: "The number on the weight stack. Never compared with free weights." };
    case "BODYWEIGHT_PLUS":
      return { short: "+ bodyweight", help: "Weight added on top of your bodyweight (0 for none)." };
    case "TOTAL":
      return { short: "total", help: "Total weight lifted (bar and plates, or the single weight)." };
    case "NONE":
      return { short: "", help: "No weight to log." };
  }
}

export interface SetFieldPlan {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
}

/** Which inputs a set row shows for an exercise (TrackingType, and LoadType NONE drops the weight). */
export function setFields(exercise: Pick<ExerciseRow, "tracking" | "loadType">): SetFieldPlan {
  switch (exercise.tracking) {
    case "LOAD_REPS":
      return { weight: exercise.loadType !== "NONE", reps: true, duration: false, distance: false };
    case "REPS":
      return { weight: false, reps: true, duration: false, distance: false };
    case "DURATION":
      return { weight: false, reps: false, duration: true, distance: false };
    case "DISTANCE_DURATION":
      return { weight: false, reps: false, duration: true, distance: true };
  }
}

export const SET_TYPE_LABEL: Record<SetType, string> = {
  WORKING: "Working",
  WARMUP: "Warm-up",
  DROP: "Drop set",
  AMRAP: "AMRAP",
};

export const TRACKING_HINT: Record<TrackingType, string> = {
  LOAD_REPS: "weight x reps",
  REPS: "reps",
  DURATION: "seconds",
  DISTANCE_DURATION: "metres and seconds",
};

export const unitLabel = (unit: WeightUnit): string => (unit === "KG" ? "kg" : "lb");

/** Effort buttons for the user's scale: RIR 0..4 (4 stands for "4+"), or RPE 10..6. Each maps to the stored RIR. */
export function effortOptions(scale: EffortScale): { rir: number; label: string }[] {
  return [0, 1, 2, 3, 4].map((rir) => ({ rir, label: scale === "RPE" ? String(10 - rir) : rir === 4 ? "4+" : String(rir) }));
}

/** "1:05", "12:09", "1:02:09": elapsed or remaining clock text from milliseconds. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
