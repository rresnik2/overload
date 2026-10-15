// Strength-standard percentiles. Every result names its comparison population.
//
// NO norms are embedded yet: the only sources with citable tables (StrengthLevel; OpenPowerlifting is competitors only,
// ExRx/Kilgore is expert-derived, Symmetric Strength is formula-based; docs/research.md) publish them as site content
// whose redistribution is not cleared, and numbers must not be invented. `strengthPercentile` therefore returns null
// until a table is registered in STANDARDS_REGISTRY; the lookup and interpolation below are complete and tested with
// injected tables. Machines, unknown sex and PREFER_NOT_TO_SAY always return null.
import type { StrengthPercentile, StrengthPercentileFn } from "@/contracts/analytics";
import type { Sex, StandardLift } from "@/contracts/enums";
import { round } from "@/lib/units";

export interface StandardsTable {
  /** Short source name, e.g. "StrengthLevel". */
  source: string;
  /** Who the percentile ranks the lifter against, e.g. "StrengthLevel users". */
  populationName: string;
  /** Percentile of each level column, ascending (e.g. [5, 20, 50, 80, 95]). */
  percentiles: number[];
  /** 1RM (kg) at each level for a bodyweight, rows ascending by bodyweight. */
  rows: { bodyweightKg: number; levelsKg: number[] }[];
}

export type StandardsRegistry = Partial<Record<StandardLift, Partial<Record<"MALE" | "FEMALE", StandardsTable>>>>;

/** Register tables here once a licensed, citable dataset is chosen. Empty on purpose. */
export const STANDARDS_REGISTRY: StandardsRegistry = {};

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) => (x1 === x0 ? y0 : y0 + ((x - x0) / (x1 - x0)) * (y1 - y0));

/** Level thresholds (kg) at a bodyweight, interpolated between table rows; null outside the table's bodyweight range. */
export function levelsAt(table: StandardsTable, bodyweightKg: number): number[] | null {
  const rows = table.rows;
  if (!rows.length) return null;
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (bodyweightKg < first.bodyweightKg || bodyweightKg > last.bodyweightKg) return null;
  const hiIdx = rows.findIndex((r) => r.bodyweightKg >= bodyweightKg);
  const hi = rows[hiIdx]!;
  const lo = rows[Math.max(0, hiIdx - 1)]!;
  return hi.levelsKg.map((v, i) => lerp(bodyweightKg, lo.bodyweightKg, hi.bodyweightKg, lo.levelsKg[i]!, v));
}

/** Percentile (1-99) of `e1rmKg` against the level thresholds, interpolating linearly between levels. */
export function percentileFromLevels(percentiles: number[], levelsKg: number[], e1rmKg: number): number {
  const n = levelsKg.length;
  if (e1rmKg <= levelsKg[0]!) return Math.max(1, round((percentiles[0]! * e1rmKg) / levelsKg[0]!, 0));
  if (e1rmKg >= levelsKg[n - 1]!) {
    const top = percentiles[n - 1]!;
    return Math.min(99, round(top + ((99 - top) * (e1rmKg - levelsKg[n - 1]!)) / levelsKg[n - 1]!, 0));
  }
  const i = levelsKg.findIndex((l) => l >= e1rmKg);
  return round(lerp(e1rmKg, levelsKg[i - 1]!, levelsKg[i]!, percentiles[i - 1]!, percentiles[i]!), 0);
}

export function strengthPercentileFrom(
  registry: StandardsRegistry,
  input: { standardLift: StandardLift; e1rmKg: number; bodyweightKg: number; sex: Sex; ageYears: number | null },
): StrengthPercentile | null {
  if (input.sex !== "MALE" && input.sex !== "FEMALE") return null;
  if (!(input.e1rmKg > 0) || !(input.bodyweightKg > 0)) return null;
  const table = registry[input.standardLift]?.[input.sex];
  if (!table) return null;
  const levels = levelsAt(table, input.bodyweightKg);
  if (!levels) return null;
  const sexLabel = input.sex === "MALE" ? "male" : "female";
  return {
    percentile: percentileFromLevels(table.percentiles, levels, input.e1rmKg),
    population: `${table.populationName}, ${sexLabel}, ${round(input.bodyweightKg, 0)} kg bodyweight`,
    source: table.source,
  };
}

/** Only barbell squat/bench/deadlift (and the standard lifts with norms). null without a registered table. */
export const strengthPercentile: StrengthPercentileFn = (input) => strengthPercentileFrom(STANDARDS_REGISTRY, input);
