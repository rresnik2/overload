// Pure: the body form's text inputs -> the strict payload the Server Action validates (no userId, no measuredAt, no derived fields).
import type { BodyFatMethod } from "@/contracts/enums";
import { parseNumber, round, toKg, type WeightUnit } from "@/lib/units";

export interface BodyFormValues {
  localDate: string;
  weight: string;
  bodyFatPct: string;
  bodyFatMethod: BodyFatMethod | "";
  neckCm: string;
  waistCm: string;
  hipCm: string;
  chestCm: string;
  armCm: string;
  thighCm: string;
  calfCm: string;
  notes: string;
}

export const EMPTY_BODY_FORM = (localDate: string): BodyFormValues => ({
  localDate,
  weight: "",
  bodyFatPct: "",
  bodyFatMethod: "",
  neckCm: "",
  waistCm: "",
  hipCm: "",
  chestCm: "",
  armCm: "",
  thighCm: "",
  calfCm: "",
  notes: "",
});

const num = (text: string): number | null => (text.trim() === "" ? null : parseNumber(text));

/** Throws nothing: unparseable text becomes NaN-free null and the server reports the missing/invalid field. */
export function buildBodyPayload(values: BodyFormValues, unit: WeightUnit) {
  const weight = num(values.weight);
  const tape = (text: string) => num(text);
  const isNavy = values.bodyFatMethod === "NAVY_TAPE";
  return {
    localDate: values.localDate,
    weightKg: weight == null ? null : round(toKg(weight, unit), 2),
    // the server recomputes a Navy estimate from the tape; the % typed here only matters for the other methods
    bodyFatPct: isNavy ? null : num(values.bodyFatPct),
    bodyFatMethod: values.bodyFatMethod === "" ? null : values.bodyFatMethod,
    neckCm: tape(values.neckCm),
    waistCm: tape(values.waistCm),
    hipCm: tape(values.hipCm),
    chestCm: tape(values.chestCm),
    armCm: tape(values.armCm),
    thighCm: tape(values.thighCm),
    calfCm: tape(values.calfCm),
    notes: values.notes.trim() === "" ? null : values.notes.trim(),
  };
}
