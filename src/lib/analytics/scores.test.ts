import { describe, expect, it } from "vitest";
import type { BodyMetricFact } from "@/contracts/analytics";
import { allometric, bodyweightPoints, bodyweightTrend, dots, ffmi, ipfGl, navyBodyFat, resolveBodyFat } from "./scores";

const metric = (over: Partial<BodyMetricFact>): BodyMetricFact => ({
  localDate: "2026-10-01", weightKg: null, bodyFatPct: null, bodyFatMethod: null, neckCm: null, waistCm: null, hipCm: null,
  chestCm: null, armCm: null, thighCm: null, calfCm: null, ...over,
});

describe("dots", () => {
  it("matches the formula for men and women (coefficients from docs/research.md)", () => {
    expect(dots({ totalKg: 700, bodyweightKg: 90, sex: "MALE" })).toBe(452.62);
    expect(dots({ totalKg: 400, bodyweightKg: 60, sex: "FEMALE" })).toBe(443.42);
  });
  it("averages the coefficients for PREFER_NOT_TO_SAY", () => {
    expect(dots({ totalKg: 500, bodyweightKg: 80, sex: "PREFER_NOT_TO_SAY" })).toBe(398.17);
  });
  it("clamps bodyweight (men 40-210)", () => {
    expect(dots({ totalKg: 700, bodyweightKg: 250, sex: "MALE" })).toBe(dots({ totalKg: 700, bodyweightKg: 210, sex: "MALE" }));
    expect(dots({ totalKg: 700, bodyweightKg: 20, sex: "MALE" })).toBe(dots({ totalKg: 700, bodyweightKg: 40, sex: "MALE" }));
  });
  it("returns null for impossible input", () => {
    expect(dots({ totalKg: 0, bodyweightKg: 80, sex: "MALE" })).toBeNull();
    expect(dots({ totalKg: 300, bodyweightKg: NaN, sex: "FEMALE" })).toBeNull();
  });
});

describe("ipfGl", () => {
  it("matches the check value: 90 kg bodyweight, 700 kg total, male -> 93.06", () => {
    expect(ipfGl({ totalKg: 700, bodyweightKg: 90, sex: "MALE" })).toBe(93.06);
  });
  it("supports women, equipped and averaged coefficients", () => {
    expect(ipfGl({ totalKg: 400, bodyweightKg: 60, sex: "FEMALE" })).toBe(90.42);
    expect(ipfGl({ totalKg: 800, bodyweightKg: 90, sex: "MALE", equipped: true })).toBe(88.28);
    expect(ipfGl({ totalKg: 500, bodyweightKg: 80, sex: "PREFER_NOT_TO_SAY" })).toBeGreaterThan(0);
  });
  it("returns null for impossible input", () => {
    expect(ipfGl({ totalKg: -1, bodyweightKg: 80, sex: "MALE" })).toBeNull();
    // women's denominator is negative below ~18 kg bodyweight
    expect(ipfGl({ totalKg: 100, bodyweightKg: 5, sex: "FEMALE" })).toBeNull();
  });
});

describe("allometric / ffmi", () => {
  it("lift / bodyweight^0.67", () => {
    expect(allometric({ liftKg: 100, bodyweightKg: 80 })).toBe(5.308);
  });
  it("computes LBM, FFMI, normalized FFMI and the +-4 body-fat range", () => {
    const r = ffmi({ weightKg: 80, heightCm: 180, bodyFatPct: 15 });
    expect(r).toEqual({ leanMassKg: 68, ffmi: 20.99, normalizedFfmi: 20.99, range: { low: 20, high: 21.98 } });
    // taller than 1.8 m lowers the normalized value, shorter raises it
    expect(ffmi({ weightKg: 80, heightCm: 190, bodyFatPct: 15 }).normalizedFfmi).toBeLessThan(ffmi({ weightKg: 80, heightCm: 190, bodyFatPct: 15 }).ffmi);
  });
});

describe("navyBodyFat", () => {
  it("men: waist - neck", () => {
    expect(navyBodyFat({ sex: "MALE", heightCm: 180, neckCm: 39, waistCm: 92 })).toBe(20.5);
  });
  it("women need hips", () => {
    expect(navyBodyFat({ sex: "FEMALE", heightCm: 165, neckCm: 33, waistCm: 80, hipCm: 100 })).toBe(31.9);
    expect(navyBodyFat({ sex: "FEMALE", heightCm: 165, neckCm: 33, waistCm: 80 })).toBeNull();
    expect(navyBodyFat({ sex: "FEMALE", heightCm: 165, neckCm: 200, waistCm: 80, hipCm: 100 })).toBeNull();
  });
  it("returns null for impossible inputs", () => {
    expect(navyBodyFat({ sex: "MALE", heightCm: 180, neckCm: 45, waistCm: 40 })).toBeNull();
    expect(navyBodyFat({ sex: "MALE", heightCm: 0, neckCm: 39, waistCm: 92 })).toBeNull();
    // an absurdly lean result is rejected
    expect(navyBodyFat({ sex: "MALE", heightCm: 180, neckCm: 39, waistCm: 60 })).toBeNull();
  });
});

describe("resolveBodyFat", () => {
  const profile = { sex: "MALE" as const, heightCm: 180 };
  it("returns null with nothing usable (and never estimates from BMI)", () => {
    expect(resolveBodyFat([], profile)).toBeNull();
    expect(resolveBodyFat([metric({ weightKg: 80 })], profile)).toBeNull();
    expect(resolveBodyFat([metric({ bodyFatPct: 15, bodyFatMethod: "VISUAL" })], profile)).toBeNull();
    expect(resolveBodyFat([metric({ bodyFatPct: 15 })], profile)).toBeNull();
    expect(resolveBodyFat([metric({ bodyFatPct: 150, bodyFatMethod: "DEXA" })], profile)).toBeNull();
  });
  it("prefers DEXA > BIA/CALIPERS > NAVY_TAPE > SCALE regardless of recency", () => {
    const all = [
      metric({ localDate: "2026-09-01", bodyFatPct: 14, bodyFatMethod: "DEXA" }),
      metric({ localDate: "2026-10-01", bodyFatPct: 17, bodyFatMethod: "BIA" }),
      metric({ localDate: "2026-10-02", neckCm: 39, waistCm: 92 }),
      metric({ localDate: "2026-10-03", bodyFatPct: 19, bodyFatMethod: "SCALE" }),
    ];
    expect(resolveBodyFat(all, profile)).toEqual({ pct: 14, method: "DEXA", localDate: "2026-09-01" });
    expect(resolveBodyFat(all.slice(1), profile)).toEqual({ pct: 17, method: "BIA", localDate: "2026-10-01" });
    expect(resolveBodyFat(all.slice(2), profile)).toEqual({ pct: 20.5, method: "NAVY_TAPE", localDate: "2026-10-02" });
    expect(resolveBodyFat(all.slice(3), profile)).toEqual({ pct: 19, method: "SCALE", localDate: "2026-10-03" });
  });
  it("takes the most recent within a tier, and the later entry on a tie", () => {
    const rows = [
      metric({ localDate: "2026-10-01", bodyFatPct: 17, bodyFatMethod: "BIA" }),
      metric({ localDate: "2026-10-05", bodyFatPct: 16, bodyFatMethod: "CALIPERS" }),
      metric({ localDate: "2026-10-05", bodyFatPct: 15, bodyFatMethod: "BIA" }),
    ];
    expect(resolveBodyFat(rows, profile)?.pct).toBe(15);
    expect(resolveBodyFat(rows.slice(0, 2), profile)?.method).toBe("CALIPERS");
  });
  it("computes from tape only for a known male/female with a height; women need hips", () => {
    const tape = metric({ neckCm: 33, waistCm: 80, hipCm: 100 });
    expect(resolveBodyFat([tape], { sex: "FEMALE", heightCm: 165 })?.pct).toBe(31.9);
    expect(resolveBodyFat([tape], { sex: "PREFER_NOT_TO_SAY", heightCm: 165 })).toBeNull();
    expect(resolveBodyFat([tape], { sex: "FEMALE", heightCm: null })).toBeNull();
    expect(resolveBodyFat([metric({ neckCm: 33, waistCm: 80 })], { sex: "FEMALE", heightCm: 165 })).toBeNull();
  });
});

describe("bodyweightTrend", () => {
  it("one point per input, time-decayed (half-life 7 days)", () => {
    const out = bodyweightTrend([
      { localDate: "2026-10-01", weightKg: 80 },
      { localDate: "2026-10-08", weightKg: 82 },
    ]);
    expect(out).toEqual([
      { localDate: "2026-10-01", trendKg: 80 },
      // weights 0.5 and 1 -> (40 + 82) / 1.5
      { localDate: "2026-10-08", trendKg: 81.33 },
    ]);
  });
  it("sorts by date, honours halfLifeDays and handles empty input", () => {
    expect(bodyweightTrend([])).toEqual([]);
    const pts = [
      { localDate: "2026-10-08", weightKg: 82 },
      { localDate: "2026-10-01", weightKg: 80 },
    ];
    const fast = bodyweightTrend(pts, { halfLifeDays: 1 });
    expect(fast.map((p) => p.localDate)).toEqual(["2026-10-01", "2026-10-08"]);
    expect(fast[1]!.trendKg).toBeGreaterThan(81.9);
  });
  it("bodyweightPoints keeps only positive weights", () => {
    expect(bodyweightPoints([metric({ weightKg: 80 }), metric({ weightKg: null }), metric({ weightKg: 0 })])).toHaveLength(1);
  });
});
