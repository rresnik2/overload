// "Last load": the heaviest working set of the last session an exercise was trained in, and the one line that describes it
// ("110 kg × 6 · Mon 12 Oct"). PURE: shared by the server query that finds it and the rows that show it. Weights are kg.
import type { LoadType, WeightUnit } from "@/contracts/enums";
import type { LocalDate } from "@/lib/dates";
import { formatNumber, fromKg, round } from "@/lib/units";

export interface LastLoad {
  exerciseId: string;
  localDate: LocalDate;
  /** The weight as logged (added load for bodyweight-plus, per side on a horn, per implement): null for reps-only work. */
  weightKg: number | null;
  reps: number | null;
  /** The machine profile's pin step, when the set was logged on one (stack drawings count pins with it). */
  pinStepKg: number | null;
  /** The unit the set was entered in (a stack labelled in lb stays in lb); null: the lifter's preference. */
  inputUnit: WeightUnit | null;
}

/** The unit to show a last load in: the one it was entered in, else the lifter's preference. */
export const lastLoadUnit = (load: Pick<LastLoad, "inputUnit">, preference: WeightUnit): WeightUnit => load.inputUnit ?? preference;

const unitText = (unit: WeightUnit) => (unit === "LB" ? "lb" : "kg");

/** The logged weight in `unit`, rounded the way the app shows weights (one decimal). null when nothing was weighed. */
export function lastLoadWeight(load: Pick<LastLoad, "weightKg">, unit: WeightUnit): number | null {
  return load.weightKg == null ? null : round(fromKg(load.weightKg, unit), 1);
}

const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Mon 12 Oct", "today" or "yesterday" relative to `today`. */
export function lastLoadDay(localDate: LocalDate, today: LocalDate | null): string {
  if (today !== null) {
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${localDate}T00:00:00Z`)) / 86_400_000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
  }
  return DAY.format(new Date(`${localDate}T00:00:00Z`)).replace(",", "");
}

/** What was lifted, in the exercise's own terms: "110 kg × 6", "30 kg each × 11", "BW + 27.5 kg × 8", "12 reps". */
export function lastLoadSet(load: Pick<LastLoad, "weightKg" | "reps">, loadType: LoadType, unit: WeightUnit): string | null {
  const w = lastLoadWeight(load, unit);
  const reps = load.reps != null && load.reps > 0 ? load.reps : null;
  const times = reps !== null ? ` × ${reps}` : "";
  if (loadType === "BODYWEIGHT_PLUS") return w !== null && w > 0 ? `BW + ${formatNumber(w, 1)} ${unitText(unit)}${times}` : reps !== null ? `Bodyweight × ${reps}` : null;
  if (w === null || w <= 0) return reps !== null ? `${reps} ${reps === 1 ? "rep" : "reps"}` : null;
  const weight = `${formatNumber(w, 1)} ${unitText(unit)}`;
  if (loadType === "PER_IMPLEMENT") return `${weight} each${times}`;
  if (loadType === "PLATES_PER_SIDE") return `${weight} a side${times}`;
  return `${weight}${times}`;
}

/** The whole line: the set and the day, or just the day when the set had nothing to show (a timed set). */
export function lastLoadText(load: LastLoad, loadType: LoadType, preference: WeightUnit, today: LocalDate | null): string {
  const set = lastLoadSet(load, loadType, lastLoadUnit(load, preference));
  const day = lastLoadDay(load.localDate, today);
  return set ? `${set} · ${day}` : `Logged ${day}`;
}
