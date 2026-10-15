// Pure helpers shared by the chart components (dates on a numeric axis, units, palette). No react, safe on server and client.
import type { Modality } from "@/contracts/enums";
import type { LocalDate } from "@/lib/dates";
import { formatNumber, fromKg, type WeightUnit } from "@/lib/units";

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for a "YYYY-MM-DD" date: the numeric x value of every time axis. */
export function dayNumber(localDate: LocalDate): number {
  return Math.round(Date.parse(`${localDate}T00:00:00Z`) / MS_PER_DAY);
}

export function dayToLocalDate(day: number): LocalDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SHORT_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Oct 11" (or "Oct 11, 2026" with `year`). */
export function formatDate(localDate: LocalDate, year = false): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  return (year ? SHORT_YEAR : SHORT).format(d);
}

export function formatDay(day: number, year = false): string {
  return formatDate(dayToLocalDate(day), year);
}

/** A kg value as the user's unit, e.g. "142.5" (no unit suffix; the unit is in the axis/title). */
export function weightText(kg: number, unit: WeightUnit, maxDecimals = 1): string {
  return formatNumber(fromKg(kg, unit), maxDecimals);
}

export const unitLabel = (unit: WeightUnit): string => (unit === "LB" ? "lb" : "kg");

/** Series colour by modality: free weight = vermilion, machine = graphite, cable = slate blue, bodyweight = ochre. */
export function modalityColor(modality: Modality): string {
  switch (modality) {
    case "FREE_WEIGHT":
      return "var(--chart-free-weight)";
    case "CABLE":
      return "var(--chart-cable)";
    case "BODYWEIGHT":
      return "var(--chart-bodyweight)";
    default:
      return "var(--chart-machine)";
  }
}

export type MarkerShape = "circle" | "square" | "diamond" | "triangle";

/** A second channel next to colour (machine graphite never rides on colour alone). */
export function modalityShape(modality: Modality): MarkerShape {
  switch (modality) {
    case "MACHINE":
      return "square";
    case "CABLE":
      return "diamond";
    case "BODYWEIGHT":
      return "triangle";
    default:
      return "circle";
  }
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Display names of the body-fat methods. */
export const METHOD_LABEL: Record<string, string> = {
  DEXA: "DEXA",
  BIA: "BIA scale",
  CALIPERS: "Calipers",
  NAVY_TAPE: "Navy tape",
  SCALE: "Scale estimate",
  BMI_ESTIMATE: "BMI estimate",
};
