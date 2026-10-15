import { describe, expect, it } from "vitest";
import { generateLifterRows } from "@/lib/fixtures/generate";
import { buildBodyView, type BodyEntry } from "./body.shape";

const rows = generateLifterRows();
const { input } = rows;

const entries: BodyEntry[] = rows.bodyMetrics.map((m, i) => ({
  id: `00000000-0000-7000-8000-${String(i).padStart(12, "0")}`,
  localDate: m.localDate,
  measuredAt: `${m.localDate}T12:00:00.000Z`,
  weightKg: m.weightKg ?? null,
  bodyFatPct: null,
  bodyFatMethod: null,
  neckCm: m.neckCm ?? null,
  waistCm: m.waistCm ?? null,
  hipCm: m.hipCm ?? null,
  chestCm: null,
  armCm: null,
  thighCm: null,
  calfCm: null,
  notes: null,
}));

describe("body view on the fixture lifter (weight cut with Navy tape)", () => {
  const view = buildBodyView({ entries, sex: "MALE", heightCm: input.profile.heightCm, today: input.today });

  it("smooths the weight: the trend follows the cut and lags the latest weigh-in", () => {
    expect(view.weight.points.length).toBe(entries.filter((e) => e.weightKg != null).length);
    expect(view.weight.trend28dKg).toBeLessThan(0);
    const last = view.weight.points.at(-1)!;
    expect(view.weight.trendKg).toBe(last.trendKg);
    expect(last.trendKg).toBeGreaterThanOrEqual(last.weightKg); // falling weight: the average lags above it
  });

  it("resolves body fat from the Navy tape with its method and shows FFMI as a range", () => {
    expect(view.bodyFat.resolved?.method).toBe("NAVY_TAPE");
    expect(view.bodyFat.history.every((p) => p.method === "NAVY_TAPE")).toBe(true);
    expect(view.ffmi).not.toBeNull();
    expect(view.ffmi!.range.low).toBeLessThan(view.ffmi!.ffmi);
    expect(view.ffmi!.range.high).toBeGreaterThan(view.ffmi!.ffmi);
    expect(view.ffmi!.method).toBe("NAVY_TAPE");
  });

  it("reports circumference changes against the previous measurement", () => {
    const waist = view.circumferences.find((c) => c.site === "waistCm")!;
    expect(waist.latestCm).toBeGreaterThan(0);
    expect(waist.deltaCm).not.toBeNull();
    expect(view.circumferences.some((c) => c.site === "hipCm")).toBe(false); // never measured
  });

  it("lists entries newest first", () => {
    const dates = view.entries.map((e) => e.localDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe("body view edge cases", () => {
  const base: BodyEntry = {
    id: "a", localDate: "2026-10-01", measuredAt: "2026-10-01T08:00:00.000Z", weightKg: 80, bodyFatPct: null, bodyFatMethod: null,
    neckCm: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, calfCm: null, notes: null,
  };

  it("an empty account has no series and no FFMI", () => {
    const v = buildBodyView({ entries: [], sex: "MALE", heightCm: 180, today: "2026-10-14" });
    expect(v.weight.points).toEqual([]);
    expect(v.weight.latestKg).toBeNull();
    expect(v.ffmi).toBeNull();
    expect(v.bodyFat.resolved).toBeNull();
  });

  it("DEXA beats a newer tape estimate; FFMI needs a height", () => {
    const e: BodyEntry[] = [
      { ...base, bodyFatPct: 18, bodyFatMethod: "DEXA" },
      { ...base, id: "b", localDate: "2026-10-10", neckCm: 38, waistCm: 82 },
    ];
    const v = buildBodyView({ entries: e, sex: "MALE", heightCm: 180, today: "2026-10-14" });
    expect(v.bodyFat.resolved).toMatchObject({ pct: 18, method: "DEXA" });
    expect(buildBodyView({ entries: e, sex: "MALE", heightCm: null, today: "2026-10-14" }).ffmi).toBeNull();
  });

  it("the BMI estimate is never used and PREFER_NOT_TO_SAY gets no Navy estimate", () => {
    const v = buildBodyView({ entries: [{ ...base, neckCm: 38, waistCm: 82 }], sex: "PREFER_NOT_TO_SAY", heightCm: 180, today: "2026-10-14" });
    expect(v.bodyFat.resolved).toBeNull();
    expect(v.bodyFat.history).toEqual([]);
  });
});
