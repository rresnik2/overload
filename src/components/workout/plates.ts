// Plate maths for the Calibrated Dial: what a total weight looks like on a bar, which totals the dial can land on, and the
// kettlebell / dumbbell picture scales. PURE (no react, no DOM): every weight here is in the row's display unit (kg or lb).
import type { Equipment, LoadType, WeightUnit } from "@/contracts/enums";
import { fromKg, round, toKg } from "@/lib/units";

export type PlateTone = "red" | "blue" | "yellow" | "green" | "white" | "black" | "chrome";

/** One plate. `height` and `width` are viewBox units of the 300 x 92 barbell canvas. */
export interface Plate {
  weight: number;
  tone: PlateTone;
  height: number;
  width: number;
}

/** Real plate colours (identical in both themes) and the ink that reads on each. */
export const PLATE_TONES: Record<PlateTone, { fill: string; ink: string }> = {
  red: { fill: "#D8262D", ink: "#FFFFFF" },
  blue: { fill: "#2F63D6", ink: "#FFFFFF" },
  yellow: { fill: "#EFBD2A", ink: "#16181A" },
  green: { fill: "#2F9A4F", ink: "#FFFFFF" },
  white: { fill: "#ECEBE6", ink: "#16181A" },
  black: { fill: "#26282A", ink: "#FFFFFF" },
  chrome: { fill: "#B9BDC2", ink: "#16181A" },
};

const plate = (weight: number, tone: PlateTone, height: number, width: number): Plate => ({ weight, tone, height, width });

/** The standard competition sets, heaviest first. */
export const PLATES: Record<WeightUnit, readonly Plate[]> = {
  KG: [plate(25, "red", 86, 13), plate(20, "blue", 86, 11), plate(15, "yellow", 74, 10), plate(10, "green", 60, 9), plate(5, "white", 44, 7), plate(2.5, "black", 36, 6), plate(1.25, "chrome", 30, 5)],
  LB: [plate(55, "red", 86, 13), plate(45, "blue", 86, 11), plate(35, "yellow", 74, 10), plate(25, "green", 60, 9), plate(10, "white", 44, 7), plate(5, "black", 36, 6), plate(2.5, "chrome", 30, 5)],
};

/** A plate that is not in the table (0.5 kg, 1 lb, ...) draws as chrome 4 x 26. */
const unknownPlate = (weight: number): Plate => plate(weight, "chrome", 26, 4);

/** Bar weights used when the lifter has no bar profile for the exercise (D1). Smith machines have none: plates only. */
export const DEFAULT_BAR_WEIGHT: Partial<Record<Equipment, Record<WeightUnit, number>>> = {
  BARBELL: { KG: 20, LB: 45 },
  EZ_BAR: { KG: 10, LB: 25 },
  TRAP_BAR: { KG: 25, LB: 55 },
};

/** Top of the dial's range per kind of load, by unit (typing beyond it is still allowed). */
export const DIAL_MAX: Record<"bar" | "side" | "dumbbell" | "stack" | "other", Record<WeightUnit, number>> = {
  bar: { KG: 400, LB: 900 },
  side: { KG: 250, LB: 550 },
  dumbbell: { KG: 80, LB: 180 },
  stack: { KG: 250, LB: 550 },
  other: { KG: 200, LB: 440 },
};

// Milli-units: every weight is turned into an integer count of thousandths so the sums below are exact.
const SCALE = 1000;
const toMilli = (w: number): number => Math.round(w * SCALE);
const fromMilli = (m: number): number => m / SCALE;
/** Hard cap on DP cells, so a silly `max` cannot hang the UI. */
const MAX_CELLS = 2_000_000;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const sameWeight = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;

const byWeightDesc = (a: Plate, b: Plate): number => b.weight - a.weight;

/**
 * The plates the gym has, in `unit`: the profile's `platesKg` converted, or the standard set when it is null or empty.
 * Conversion is rounded the way plates are labelled (20.41 kg -> 45 lb); a plate that matches no standard plate draws as
 * chrome 4 x 26. Heaviest first, no duplicates.
 */
export function plateSet(unit: WeightUnit, platesKg: readonly number[] | null): readonly Plate[] {
  if (!platesKg || platesKg.length === 0) return PLATES[unit];
  const out: Plate[] = [];
  for (const kg of platesKg) {
    if (!Number.isFinite(kg) || kg <= 0) continue;
    const inUnit = fromKg(kg, unit);
    const lbMatch = unit === "LB" ? PLATES.LB.find((p) => Math.abs(p.weight - inUnit) / p.weight <= 0.02) : undefined;
    const kgMatch = PLATES.KG.find((p) => sameWeight(p.weight, kg));
    let built: Plate;
    if (unit === "KG") {
      built = kgMatch ?? unknownPlate(inUnit);
    } else if (lbMatch) {
      built = lbMatch;
    } else {
      // A kg plate in an lb gym: keep the colour of the kg plate, label it to the nearest half pound.
      const weight = Math.max(0.5, Math.round(inUnit * 2) / 2);
      built = kgMatch ? { ...kgMatch, weight } : unknownPlate(weight);
    }
    if (!out.some((p) => sameWeight(p.weight, built.weight))) out.push(built);
  }
  return out.length === 0 ? PLATES[unit] : out.sort(byWeightDesc);
}

// ───────────────────────────── loading ─────────────────────────────

/** `perSide` is heaviest first (repeats allowed). `loaded` is the weight actually made; `exact` says it equals the request. */
export interface Loadout {
  perSide: Plate[];
  loaded: number;
  exact: boolean;
}

interface Table {
  /** Grid step in milli-units (gcd of the plates). */
  g: number;
  /** plates by weight, heaviest first, in grid cells */
  cells: { plate: Plate; c: number }[];
  /** fewest plates to make each cell, -1 when unreachable (empty when `tooBig`) */
  min: Int32Array;
  /** The range needs more than MAX_CELLS cells, so no table was built. */
  tooBig: boolean;
}

function buildTable(plates: readonly Plate[], maxMilli: number): Table | null {
  const usable = plates.filter((p) => p.weight > 0 && toMilli(p.weight) > 0).slice().sort(byWeightDesc);
  if (usable.length === 0) return null;
  const g = usable.reduce((acc, p) => gcd(acc, toMilli(p.weight)), 0);
  const cells = usable.map((p) => ({ plate: p, c: toMilli(p.weight) / g }));
  const wanted = Math.floor(maxMilli / g);
  if (wanted > MAX_CELLS) return { g, cells, min: new Int32Array(0), tooBig: true };
  const size = wanted;
  const min = new Int32Array(size + 1).fill(-1);
  min[0] = 0;
  for (let i = 1; i <= size; i++) {
    let best = -1;
    for (const { c } of cells) {
      if (c > i) continue;
      const prev = min[i - c] as number;
      if (prev >= 0 && (best < 0 || prev + 1 < best)) best = prev + 1;
    }
    min[i] = best;
  }
  return { g, cells, min, tooBig: false };
}

/**
 * The 55 lb red plate is a competition plate: gyms mostly load 45s (225 lb is 45 + 45, not 55 + 35), so it is tried last
 * and only used when it saves a plate.
 */
const isReserved = (p: Plate): boolean => p.tone === "red" && p.weight === 55;

/** Fewest plates, heaviest first, that make cell `i`. */
function unwind(t: Table, i: number): Plate[] {
  const out: Plate[] = [];
  const order = [...t.cells.filter(({ plate: p }) => !isReserved(p)), ...t.cells.filter(({ plate: p }) => isReserved(p))];
  let cur = i;
  while (cur > 0) {
    const need = (t.min[cur] as number) - 1;
    const step = order.find(({ c }) => c <= cur && t.min[cur - c] === need);
    if (!step) break;
    out.push(step.plate);
    cur -= step.c;
  }
  return out.sort(byWeightDesc);
}

/** Greedy heaviest first: the fallback when the DP table would be absurdly large. */
function greedy(targetMilli: number, plates: readonly Plate[]): { perSide: Plate[]; milli: number } {
  const perSide: Plate[] = [];
  let left = targetMilli;
  for (const p of plates.slice().sort(byWeightDesc)) {
    const w = toMilli(p.weight);
    if (w <= 0) continue;
    while (left >= w) {
      perSide.push(p);
      left -= w;
    }
  }
  return { perSide, milli: targetMilli - left };
}

/** The plates for the nearest reachable amount at or below `targetMilli`. */
function nearestBelow(targetMilli: number, plates: readonly Plate[]): { perSide: Plate[]; milli: number } {
  if (!(targetMilli > 0)) return { perSide: [], milli: 0 };
  const table = buildTable(plates, targetMilli);
  if (!table) return { perSide: [], milli: 0 };
  if (table.tooBig) return greedy(targetMilli, plates);
  let i = table.min.length - 1;
  while (i > 0 && (table.min[i] as number) < 0) i--;
  return { perSide: unwind(table, i), milli: i * table.g };
}

/**
 * Plates per side for a total on a bar: from `(total - bar) / 2`, heaviest first. When that cannot be made exactly the
 * loadout is the nearest weight below and `exact` is false. A total below the bar is an empty loadout (`loaded` = the bar,
 * `exact` false; the caption says "Lighter than the 20 kg bar").
 */
export function loadBar(total: number, bar: number, plates: readonly Plate[]): Loadout {
  const barM = toMilli(Math.max(0, bar));
  const totalM = toMilli(total);
  if (!Number.isFinite(total) || totalM < barM) return { perSide: [], loaded: fromMilli(barM), exact: false };
  const sideM = Math.floor((totalM - barM) / 2);
  const { perSide, milli } = nearestBelow(sideM, plates);
  const loadedM = barM + 2 * milli;
  return { perSide, loaded: fromMilli(loadedM), exact: loadedM === totalM };
}

/** Plate-loaded machines: plates on one horn. `loaded` is per side, like the input. */
export function loadSide(perSide: number, plates: readonly Plate[]): Loadout {
  const targetM = toMilli(perSide);
  if (!Number.isFinite(perSide) || targetM <= 0) return { perSide: [], loaded: 0, exact: targetM === 0 };
  const { perSide: made, milli } = nearestBelow(targetM, plates);
  return { perSide: made, loaded: fromMilli(milli), exact: milli === targetM };
}

/** Every total the plate set can make from `bar` up to `max`, ascending (so no 1.25 kg plates means 5 kg steps). */
export function loadableTotals(bar: number, plates: readonly Plate[], max: number): number[] {
  const barM = toMilli(Math.max(0, bar));
  const maxM = toMilli(max);
  if (!Number.isFinite(max) || maxM < barM) return [];
  const sideMax = Math.floor((maxM - barM) / 2);
  const table = buildTable(plates, sideMax);
  if (!table) return [fromMilli(barM)];
  if (table.tooBig) return [];
  const out: number[] = [];
  for (let i = 0; i < table.min.length; i++) {
    if ((table.min[i] as number) >= 0) out.push(fromMilli(barM + 2 * i * table.g));
  }
  return out;
}

/** The drawing's overflow rule: widths shrink to 60% at least to fit `room` units, then the outer plates become a "+n" badge. */
export interface FittedSide {
  plates: Plate[];
  /** Multiply each plate's width by this (1 when everything fits). */
  widthScale: number;
  /** Plates not drawn (the lightest, outermost), shown as "+n". */
  hidden: number;
}

export function fitPlates(perSide: readonly Plate[], room = 85, gap = 1.5): FittedSide {
  const gaps = (n: number) => gap * Math.max(0, n - 1);
  const widths = (list: readonly Plate[]) => list.reduce((sum, p) => sum + p.width, 0);
  let drawn = perSide.slice();
  const fit = (list: readonly Plate[]) => (room - gaps(list.length)) / Math.max(widths(list), 1e-9);
  const scale = Math.min(1, fit(drawn));
  if (scale >= 0.6) return { plates: drawn, widthScale: scale, hidden: 0 };
  while (drawn.length > 0 && fit(drawn) < 0.6) drawn = drawn.slice(0, -1);
  return { plates: drawn, widthScale: Math.min(1, Math.max(0.6, fit(drawn))), hidden: perSide.length - drawn.length };
}

/** The tone of the heaviest plate on the bar (the dial's rim colour), or null for an empty bar (steel). */
export function heaviestTone(perSide: readonly Plate[]): PlateTone | null {
  const top = perSide.reduce<Plate | null>((best, p) => (best === null || p.weight > best.weight ? p : best), null);
  return top ? top.tone : null;
}

/** Caption data for a barbell picture. The UI owns the wording (labels.ts). */
export type LoadNote =
  | { kind: "empty"; bar: number }
  | { kind: "below-bar"; bar: number; requested: number }
  | { kind: "inexact"; requested: number; nearest: number }
  | null;

export function loadNote(total: number | null, bar: number, loadout: Loadout): LoadNote {
  if (total === null || !Number.isFinite(total)) return null;
  if (total < bar - 1e-9) return { kind: "below-bar", bar, requested: total };
  if (!loadout.exact) return { kind: "inexact", requested: total, nearest: loadout.loaded };
  if (loadout.perSide.length === 0) return { kind: "empty", bar };
  return null;
}

// ───────────────────────────── kettlebells and dumbbells ─────────────────────────────

/** Bell sizes as labelled; the lb list is the kg list converted and rounded (D5). */
export const KETTLEBELL_SIZES: Record<WeightUnit, readonly number[]> = {
  KG: [4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48],
  LB: [9, 13, 18, 22, 26, 31, 35, 44, 53, 62, 70, 80, 88, 97, 106],
};

const KETTLEBELL_FILL = ["#C7C9CC", "#F2B7CC", "#EC6FA3", "#8CC6EA", "#2F6FD8", "#8D9399", "#EFBD2A", "#8A5CC9", "#2F9A4F", "#EF7C22", "#D8262D", "#5F6369", "#ECEBE6", "#B9BDC2", "#C9A646"] as const;
/** Sizes (by index into KETTLEBELL_SIZES) that take dark ink: 4, 6, 10, 16, 40, 44, 48 kg. */
const KETTLEBELL_DARK_INK = new Set([0, 1, 3, 6, 12, 13, 14]);

/** Colour and ink of a bell. An off-list size (18 kg, say) takes the colour of the next size down. */
export function kettlebellStyle(weight: number, unit: WeightUnit): { fill: string; ink: string } {
  const sizes = KETTLEBELL_SIZES[unit];
  let index = 0;
  for (let i = 0; i < sizes.length; i++) if ((sizes[i] as number) <= weight + 1e-9) index = i;
  return { fill: KETTLEBELL_FILL[index] as string, ink: KETTLEBELL_DARK_INK.has(index) ? "#16181A" : "#FFFFFF" };
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Dumbbell head scale: k = (26 + 66 sqrt((w - 2) / 58)) / 92, clamped to 0.28..1 (w in kg; lb is converted). */
export function dumbbellScale(weight: number, unit: WeightUnit): number {
  const kg = unit === "KG" ? weight : toKg(weight, unit);
  const k = (26 + 66 * Math.sqrt(clamp((kg - 2) / 58, 0, 1))) / 92;
  return clamp(k, 0.28, 1);
}

/** Kettlebell scale from its base centre: k = 0.42 + 0.58 sqrt((w - 4) / 44) (w in kg; lb is converted). */
export function kettlebellScale(weight: number, unit: WeightUnit): number {
  const kg = unit === "KG" ? weight : toKg(weight, unit);
  return clamp(0.42 + 0.58 * Math.sqrt(clamp((kg - 4) / 44, 0, 1)), 0.42, 1);
}

// ───────────────────────────── dial values ─────────────────────────────

const BAR_EQUIPMENT: readonly Equipment[] = ["BARBELL", "EZ_BAR", "TRAP_BAR", "SMITH_MACHINE"];

export interface DialValuesInput {
  equipment: Equipment;
  loadType: LoadType;
  unit: WeightUnit;
  /** Dial step in `unit` (weightStep()). */
  step: number;
  /** The set's current weight in `unit`; inserted in order when it is not on the list. */
  current: number | null;
  /** Bar weight for bars (null: the equipment default, else plates only). For a weight stack: the base load, i.e. pin 1. */
  bar: number | null;
  /** The plates the gym has (plateSet()); defaults to the standard set for `unit`. */
  plates?: readonly Plate[];
}

function insertValue(values: number[], v: number): number[] {
  const x = round(v, 3);
  if (!Number.isFinite(x) || x < 0 || values.some((u) => sameWeight(u, x))) return values;
  const at = values.findIndex((u) => u > x);
  const next = values.slice();
  next.splice(at < 0 ? next.length : at, 0, x);
  return next;
}

function range(from: number, step: number, max: number): number[] {
  const out: number[] = [];
  const n = Math.floor((max - from) / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(round(from + i * step, 3));
  return out;
}

/** Every value the dial offers for this equipment, ascending and unique. */
export function dialValues(input: DialValuesInput): number[] {
  const { equipment, loadType, unit, current } = input;
  const step = input.step > 0 && Number.isFinite(input.step) ? input.step : unit === "KG" ? 2.5 : 5;
  let values: number[];
  if (equipment === "KETTLEBELL") {
    values = [...KETTLEBELL_SIZES[unit]];
  } else if (BAR_EQUIPMENT.includes(equipment) && loadType === "TOTAL") {
    const bar = input.bar ?? DEFAULT_BAR_WEIGHT[equipment]?.[unit] ?? 0;
    values = loadableTotals(bar, input.plates ?? PLATES[unit], DIAL_MAX.bar[unit]);
  } else if (loadType === "PLATES_PER_SIDE" || equipment === "MACHINE_PLATE_LOADED") {
    values = range(0, step, DIAL_MAX.side[unit]);
  } else if (loadType === "STACK") {
    values = range(input.bar !== null && input.bar >= 0 ? input.bar : step, step, DIAL_MAX.stack[unit]);
  } else if (equipment === "DUMBBELL") {
    values = range(step, step, DIAL_MAX.dumbbell[unit]);
  } else {
    values = range(step, step, DIAL_MAX.other[unit]);
  }
  return current === null ? values : insertValue(values, current);
}

/** The pin a weight sits on: with a base load pin 1 is the base, else value / step. */
export function pinFor(value: number, step: number, base: number | null): number {
  if (!(step > 0)) return 0;
  const pin = base !== null ? Math.round((value - base) / step) + 1 : Math.round(value / step);
  return pin || 0;
}
