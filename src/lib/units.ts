// Unit conversion + weight display helpers. PURE. FROZEN after Phase 0.
//
// Storage rule: weights are kg (Decimal(7,3)); the unit the user typed is kept in `inputUnit`
// so pound entries display exactly as entered ("135", not "135.0001").

export type WeightUnit = "KG" | "LB";

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

/** Storage precision for kg values (Decimal(7,3)). */
export const KG_STORAGE_DP = 3;

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Number.EPSILON nudges 1.005 -> 1.01 style cases the right way.
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function roundToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

export function lbToKg(lb: number): number {
  return round(lb * KG_PER_LB, KG_STORAGE_DP);
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Convert an entered value in `unit` to kg for storage (rounded to storage precision). */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === "KG" ? round(value, KG_STORAGE_DP) : lbToKg(value);
}

/** Convert stored kg to a number in `unit`, rounded to 2 dp (so 61.235 kg -> 135 lb, not 135.0001). */
export function fromKg(kg: number, unit: WeightUnit): number {
  return round(unit === "KG" ? kg : kgToLb(kg), 2);
}

/** "62.5", "135", "61.24": at most 2 decimals, trailing zeros trimmed. */
export function formatNumber(value: number, maxDecimals = 2): string {
  return String(round(value, maxDecimals));
}

/** Display a stored kg weight in the unit the user wants to see. */
export function formatWeight(kg: number, unit: WeightUnit, opts: { withUnit?: boolean } = {}): string {
  const n = formatNumber(fromKg(kg, unit));
  return opts.withUnit === false ? n : `${n} ${unit === "KG" ? "kg" : "lb"}`;
}

/**
 * Which unit should a stored set weight be shown in? A set remembers the unit it was typed in
 * (`inputUnit`); fall back to the user's preference.
 */
export function displayUnit(inputUnit: WeightUnit | null | undefined, preference: WeightUnit): WeightUnit {
  return inputUnit ?? preference;
}

/** Parse user text ("62,5", " 135 ", "1 000.5") into a finite number, or null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/\s+/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** RPE = 10 - RIR. Effort is stored as RIR; RPE is display only. */
export function rirToRpe(rir: number): number {
  return 10 - rir;
}
export function rpeToRir(rpe: number): number {
  return 10 - rpe;
}

/** Default NumberStepper increment (in the entry unit) by equipment. Machines use their pin step when known. */
export function defaultIncrement(
  unit: WeightUnit,
  equipment: string,
  opts: { pinStepKg?: number | null } = {},
): number {
  if (opts.pinStepKg && opts.pinStepKg > 0) return fromKg(opts.pinStepKg, unit);
  const kg: Record<string, number> = {
    BARBELL: 2.5,
    EZ_BAR: 2.5,
    TRAP_BAR: 2.5,
    SMITH_MACHINE: 2.5,
    DUMBBELL: 2,
    KETTLEBELL: 4,
    PLATE: 2.5,
    MACHINE_SELECTORIZED: 5,
    MACHINE_PLATE_LOADED: 5,
    CABLE: 2.5,
    BODYWEIGHT: 1,
    BAND: 1,
  };
  const lb: Record<string, number> = {
    BARBELL: 5,
    EZ_BAR: 5,
    TRAP_BAR: 5,
    SMITH_MACHINE: 5,
    DUMBBELL: 5,
    KETTLEBELL: 8,
    PLATE: 5,
    MACHINE_SELECTORIZED: 10,
    MACHINE_PLATE_LOADED: 10,
    CABLE: 5,
    BODYWEIGHT: 2.5,
    BAND: 2.5,
  };
  return (unit === "KG" ? kg : lb)[equipment] ?? (unit === "KG" ? 2.5 : 5);
}
