// Strength and body-composition scores. Coefficients and check values are in docs/research.md.
// [Verify] coefficients (IPF GL bench-only, Wilks2) are intentionally NOT implemented: see DISABLED_COEFFICIENTS.
import type {
  Allometric,
  BodyMetricFact,
  BodyweightTrend,
  Dots,
  Ffmi,
  IpfGl,
  NavyBodyFat,
  ResolveBodyFat,
  ResolvedBodyFat,
} from "@/contracts/analytics";
import type { BodyFatMethod, Sex } from "@/contracts/enums";
import { diffDays } from "@/lib/dates";
import { round } from "@/lib/units";
import {
  ALLOMETRIC_EXPONENT,
  BODYWEIGHT_TREND_HALF_LIFE_DAYS,
  BODY_FAT_SOURCE_PRIORITY,
  BODY_FAT_VALID_RANGE,
  DOTS_FEMALE,
  DOTS_MALE,
  DOTS_NUMERATOR,
  FFMI_BODY_FAT_RANGE_POINTS,
  FFMI_HEIGHT_REFERENCE_M,
  FFMI_NORMALIZE_COEFFICIENT,
  IPF_GL_CLASSIC,
  IPF_GL_EQUIPPED,
  IPF_GL_NUMERATOR,
  NAVY,
  type DotsCoefficients,
  type IpfGlCoefficients,
} from "./constants";

const positive = (n: number) => Number.isFinite(n) && n > 0;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function averageDots(): DotsCoefficients {
  const avg = (k: keyof DotsCoefficients) => (DOTS_MALE[k] + DOTS_FEMALE[k]) / 2;
  // The narrower bodyweight range applies to the averaged curve.
  return { a: avg("a"), b: avg("b"), c: avg("c"), d: avg("d"), e: avg("e"), minBw: Math.max(DOTS_MALE.minBw, DOTS_FEMALE.minBw), maxBw: Math.min(DOTS_MALE.maxBw, DOTS_FEMALE.maxBw) };
}

function dotsCoefficients(sex: Sex): DotsCoefficients {
  return sex === "MALE" ? DOTS_MALE : sex === "FEMALE" ? DOTS_FEMALE : averageDots();
}

/** DOTS points. PREFER_NOT_TO_SAY -> averaged male/female coefficients. Clamps bodyweight (men 40-210, women 40-150). */
export const dots: Dots = ({ totalKg, bodyweightKg, sex }) => {
  if (!positive(totalKg) || !positive(bodyweightKg)) return null;
  const k = dotsCoefficients(sex);
  const x = clamp(bodyweightKg, k.minBw, k.maxBw);
  const denominator = k.a + k.b * x + k.c * x ** 2 + k.d * x ** 3 + k.e * x ** 4;
  if (!(denominator > 0)) return null;
  return round((DOTS_NUMERATOR * totalKg) / denominator, 2);
};

function ipfCoefficients(sex: Sex, equipped: boolean): IpfGlCoefficients {
  const table = equipped ? IPF_GL_EQUIPPED : IPF_GL_CLASSIC;
  if (sex === "MALE" || sex === "FEMALE") return table[sex];
  return {
    a: (table.MALE.a + table.FEMALE.a) / 2,
    b: (table.MALE.b + table.FEMALE.b) / 2,
    c: (table.MALE.c + table.FEMALE.c) / 2,
  };
}

/** IPF GL points (classic, raw by default). Check value: 90 kg bodyweight, 700 kg total, male -> 93.06. */
export const ipfGl: IpfGl = ({ totalKg, bodyweightKg, sex, equipped = false }) => {
  if (!positive(totalKg) || !positive(bodyweightKg)) return null;
  const k = ipfCoefficients(sex, equipped);
  const denominator = k.a - k.b * Math.exp(-k.c * bodyweightKg);
  if (!(denominator > 0)) return null;
  return round((IPF_GL_NUMERATOR * totalKg) / denominator, 2);
};

/** Allometric relative strength: lift / bodyweight^0.67 (jaric2002). */
export const allometric: Allometric = ({ liftKg, bodyweightKg }) => round(liftKg / bodyweightKg ** ALLOMETRIC_EXPONENT, 3);

/** LBM = BW(1 - BF%), FFMI = LBM / h^2, normalized = FFMI + 6.1 (1.8 - h). h in metres. Range: body fat +-4 points. */
export const ffmi: Ffmi = ({ weightKg, heightCm, bodyFatPct }) => {
  const h = heightCm / 100;
  const at = (bf: number) => (weightKg * (1 - clamp(bf, 0, 100) / 100)) / h ** 2;
  const value = at(bodyFatPct);
  return {
    leanMassKg: round(weightKg * (1 - clamp(bodyFatPct, 0, 100) / 100), 2),
    ffmi: round(value, 2),
    normalizedFfmi: round(value + FFMI_NORMALIZE_COEFFICIENT * (FFMI_HEIGHT_REFERENCE_M - h), 2),
    range: {
      low: round(at(bodyFatPct + FFMI_BODY_FAT_RANGE_POINTS), 2),
      high: round(at(bodyFatPct - FFMI_BODY_FAT_RANGE_POINTS), 2),
    },
  };
};

/** US Navy tape estimate (cm, log10; hodgdon1984). Women need hipCm. null when inputs are impossible. */
export const navyBodyFat: NavyBodyFat = ({ sex, heightCm, neckCm, waistCm, hipCm }) => {
  if (![heightCm, neckCm, waistCm].every(positive)) return null;
  let pct: number;
  if (sex === "MALE") {
    if (waistCm <= neckCm) return null;
    const k = NAVY.MALE;
    pct = NAVY.numerator / (k.a - k.b * Math.log10(waistCm - neckCm) + k.c * Math.log10(heightCm)) - NAVY.offset;
  } else {
    if (hipCm == null || !positive(hipCm) || waistCm + hipCm <= neckCm) return null;
    const k = NAVY.FEMALE;
    pct = NAVY.numerator / (k.a - k.b * Math.log10(waistCm + hipCm - neckCm) + k.c * Math.log10(heightCm)) - NAVY.offset;
  }
  if (!Number.isFinite(pct) || pct < NAVY.minPct || pct > NAVY.maxPct) return null;
  return round(pct, 1);
};

function tier(method: BodyFatMethod): number {
  return BODY_FAT_SOURCE_PRIORITY.findIndex((group) => (group as readonly string[]).includes(method));
}

/** Source priority: DEXA > BIA/CALIPERS > NAVY_TAPE (computed from tape) > SCALE; the BMI estimate is NEVER returned. */
export const resolveBodyFat: ResolveBodyFat = (metrics, profile) => {
  const candidates: { tier: number; value: ResolvedBodyFat }[] = [];
  const naiveSex = profile.sex === "MALE" || profile.sex === "FEMALE" ? profile.sex : null;
  for (const m of metrics) {
    const stored = m.bodyFatPct;
    if (stored != null && m.bodyFatMethod && stored >= BODY_FAT_VALID_RANGE.min && stored <= BODY_FAT_VALID_RANGE.max) {
      const t = tier(m.bodyFatMethod);
      if (t >= 0) candidates.push({ tier: t, value: { pct: stored, method: m.bodyFatMethod, localDate: m.localDate } });
    }
    if (naiveSex && profile.heightCm != null && m.neckCm != null && m.waistCm != null) {
      const pct = navyBodyFat({ sex: naiveSex, heightCm: profile.heightCm, neckCm: m.neckCm, waistCm: m.waistCm, hipCm: m.hipCm });
      if (pct != null) candidates.push({ tier: tier("NAVY_TAPE"), value: { pct, method: "NAVY_TAPE", localDate: m.localDate } });
    }
  }
  if (!candidates.length) return null;
  const best = Math.min(...candidates.map((c) => c.tier));
  // Within the winning tier the most recent measurement wins; a tie on the date keeps the later entry.
  return candidates
    .filter((c) => c.tier === best)
    .reduce((a, b) => (b.value.localDate >= a.value.localDate ? b : a)).value;
};

/** Time-decayed moving average of bodyweight (default half-life 7 days), one point per input point. */
export const bodyweightTrend: BodyweightTrend = (points, opts) => {
  const halfLife = opts?.halfLifeDays ?? BODYWEIGHT_TREND_HALF_LIFE_DAYS;
  const sorted = points.map((p, i) => ({ p, i })).sort((a, b) => a.p.localDate.localeCompare(b.p.localDate) || a.i - b.i).map((x) => x.p);
  const out: { localDate: string; trendKg: number }[] = [];
  let weight = 0;
  let weighted = 0;
  let prevDate: string | null = null;
  for (const p of sorted) {
    const decay = prevDate == null ? 0 : 0.5 ** (diffDays(prevDate, p.localDate) / halfLife);
    weight = weight * decay + 1;
    weighted = weighted * decay + p.weightKg;
    prevDate = p.localDate;
    out.push({ localDate: p.localDate, trendKg: round(weighted / weight, 2) });
  }
  return out;
};

/** Bodyweight series from body metrics (kg only). Convenience for rules and facts. */
export function bodyweightPoints(metrics: BodyMetricFact[]): { localDate: string; weightKg: number }[] {
  return metrics.flatMap((m) => (m.weightKg != null && m.weightKg > 0 ? [{ localDate: m.localDate, weightKg: m.weightKg }] : []));
}
