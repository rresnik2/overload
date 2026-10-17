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

// ───────────────────────────── the mobile set editor (Calibrated Dial) ─────────────────────────────
// Every string the dial panel shows lives here so the app can be translated later.

/** "KG", "LB", "KG / HAND", "KG / SIDE": the unit after the big number. */
export function readoutUnit(unit: WeightUnit, loadType: ExerciseRow["loadType"]): string {
  const base = unit === "KG" ? "KG" : "LB";
  if (loadType === "PER_IMPLEMENT") return `${base} / HAND`;
  if (loadType === "PLATES_PER_SIDE") return `${base} / SIDE`;
  return base;
}

const spokenUnit = (unit: WeightUnit, count: number): string => (unit === "KG" ? (count === 1 ? "kilogram" : "kilograms") : count === 1 ? "pound" : "pounds");
const short = (unit: WeightUnit): string => (unit === "KG" ? "kg" : "lb");
const fmt = (value: number): string => String(Math.round(value * 100) / 100);

/** Screen-reader text for a dial value: "102.5 kilograms total", "32 kilograms per hand", "Pin 9, 45 kilograms". */
export function weightSpoken(value: number, unit: WeightUnit, loadType: ExerciseRow["loadType"], pin?: number | null): string {
  const base = `${fmt(value)} ${spokenUnit(unit, value)}`;
  if (loadType === "STACK" && pin != null && pin > 0) return `Pin ${pin}, ${base}`;
  if (loadType === "PER_IMPLEMENT") return `${base} per hand`;
  if (loadType === "PLATES_PER_SIDE") return `${base} per side`;
  if (loadType === "BODYWEIGHT_PLUS") return `${base} added`;
  if (loadType === "TOTAL") return `${base} total`;
  return base;
}

export const PANEL_COPY = {
  logSet: "Log set",
  logged: "Logged ✓",
  reopen: "Edit set",
  needValue: "Set a weight or reps first",
  perSide: "Per side",
  barAndPlates: "Bar and plates",
  /** The gear link under the picture: "Dumbbells · 2 kg steps · Edit" / "Kettlebells · your 6 bells · Edit". */
  gearDumbbells: (step: number, unit: WeightUnit) => `Dumbbells · ${fmt(step)} ${short(unit)} steps · Edit`,
  gearKettlebells: (owned: number | null) => (owned ? `Kettlebells · your ${owned} ${owned === 1 ? "bell" : "bells"} · Edit` : "Kettlebells · standard sizes · Edit"),
  weightFor: (ordinal: number) => `Set ${ordinal} weight`,
  repsFor: (ordinal: number) => `Set ${ordinal} reps`,
  typeWeight: (ordinal: number) => `Set ${ordinal} weight, tap to type`,
  typedWeight: (ordinal: number, unit: WeightUnit) => `Type set ${ordinal} weight in ${unit === "KG" ? "kilograms" : "pounds"}`,
  emptyBar: (bar: number, unit: WeightUnit) => `Empty bar · ${fmt(bar)} ${short(unit)}`,
  lighterThanBar: (bar: number, unit: WeightUnit) => `Lighter than the ${fmt(bar)} ${short(unit)} bar`,
  inexact: (requested: number, nearest: number, unit: WeightUnit) => `${fmt(requested)} ${short(unit)} can’t be loaded exactly · nearest ${fmt(nearest)} ${short(unit)}`,
  barUnknown: "Bar weight not set",
  baseTotal: (base: number, total: number, unit: WeightUnit) => `+ ${fmt(base)} ${short(unit)} base = ${fmt(total)} ${short(unit)} total`,
  pair: (each: number, unit: WeightUnit) => `Pair of ${fmt(each)} ${short(unit)} · ${fmt(each * 2)} ${short(unit)} total`,
  one: (weight: number, unit: WeightUnit) => `One ${fmt(weight)} ${short(unit)} dumbbell`,
  bell: (weight: number, unit: WeightUnit) => `${fmt(weight)} ${short(unit)} bell`,
  bellPair: (each: number, unit: WeightUnit) => `Pair of ${fmt(each)} ${short(unit)} bells · ${fmt(each * 2)} ${short(unit)} total`,
  pin: (pin: number, of: number | null, weight: number, step: number, unit: WeightUnit) => `Pin ${pin}${of ? ` of ${of}` : ""} · ${fmt(weight)} ${short(unit)} · ${fmt(step)} ${short(unit)} per plate`,
  addedToBodyweight: (bodyweight: number, unit: WeightUnit) => `Added to ${fmt(bodyweight)} ${short(unit)} bodyweight`,
  limited: (max: number, unit: WeightUnit) => `Limited to ${fmt(max)} ${short(unit)}`,
  /** The meta line under the name: "Barbell · 20 kg bar · set 3 of 4 · last 100 × 5 @ RIR 2". */
  meta: (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · "),
  pictureLabel: {
    bar: (perSide: number[], unit: WeightUnit) => (perSide.length === 0 ? "Empty bar" : `Bar loaded with ${perSide.map(fmt).join(", ")} ${spokenUnit(unit, 2)} per side`),
    horn: (perSide: number[], unit: WeightUnit) => (perSide.length === 0 ? "Empty loading horn" : `Loading horn with ${perSide.map(fmt).join(", ")} ${spokenUnit(unit, 2)}`),
    dumbbell: (weight: number, unit: WeightUnit, pair: boolean) => `${pair ? "Pair of dumbbells" : "A dumbbell"}, ${fmt(weight)} ${spokenUnit(unit, weight)} each`,
    kettlebell: (weight: number, unit: WeightUnit, pair: boolean) => `${pair ? "Pair of kettlebells" : "A kettlebell"}, ${fmt(weight)} ${spokenUnit(unit, weight)}${pair ? " each" : ""}`,
    stack: (pin: number, weight: number, unit: WeightUnit) => `Weight stack with the pin at plate ${pin}, ${fmt(weight)} ${spokenUnit(unit, weight)}`,
  },
} as const;

/** "RIR 2" / "RPE 8" for a stored RIR, or null when none was recorded. */
export function effortText(scale: EffortScale, rir: number | null | undefined): string | null {
  if (rir == null) return null;
  const label = effortOptions(scale).find((o) => o.rir === Math.min(4, Math.max(0, Math.round(rir))))?.label;
  return label ? `${scale} ${label}` : null;
}
