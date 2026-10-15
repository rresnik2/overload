import { describe, expect, it } from "vitest";
import type { ForecastInput, SessionPoint } from "@/contracts/analytics";
import { addDays } from "@/lib/dates";
import { compareToPopulation, forecastE1rm, median, prepareSeries, t0Weeks } from "./forecast";

const TODAY = "2026-10-11";
const points = (n: number, e1rm: (i: number) => number, opts: { everyDays?: number; end?: string; deload?: (i: number) => boolean } = {}): SessionPoint[] => {
  const step = opts.everyDays ?? 7;
  const end = opts.end ?? TODAY;
  return Array.from({ length: n }, (_, i) => ({ localDate: addDays(end, -step * (n - 1 - i)), e1rmKg: e1rm(i), seriesKey: "s", isDeload: opts.deload?.(i) ?? false }));
};
const input = (pts: SessionPoint[], over: Partial<ForecastInput> = {}): ForecastInput => ({
  points: pts, sex: "MALE", experience: "INTERMEDIATE", standardLift: "SQUAT", firstWorkoutDate: null, today: TODAY, ...over,
});

describe("prepareSeries", () => {
  it("drops deloads, outliers (> 3 MAD) and everything before a >= 4-week layoff", () => {
    const pts = [
      ...points(3, () => 80, { end: "2026-07-01" }),
      ...points(8, (i) => (i === 4 ? 200 : i === 2 ? 60 : 100 + i), { end: TODAY }),
    ];
    pts[3 + 6]!.isDeload = true;
    const prep = prepareSeries(pts, TODAY);
    expect(prep.excluded.beforeLayoff).toBe(3);
    expect(prep.excluded.deload).toBe(1);
    expect(prep.excluded.outliers).toBe(2);
    expect(prep.used).toHaveLength(5);
    expect(prep.ongoingLayoff).toBe(false);
  });
  it("flags an ongoing layoff and copes with empty input and tiny series", () => {
    expect(prepareSeries([], TODAY)).toMatchObject({ used: [], ongoingLayoff: false });
    expect(prepareSeries(points(2, () => 100, { end: "2026-08-01" }), TODAY).ongoingLayoff).toBe(true);
    expect(prepareSeries(points(2, (i) => (i ? 500 : 100)), TODAY).used).toHaveLength(2);
  });
  it("does not flag small wobble on a flat series as outliers (MAD floor)", () => {
    const flat = points(8, (i) => (i === 3 ? 103 : 100));
    expect(prepareSeries(flat, TODAY).excluded.outliers).toBe(0);
  });
});

describe("t0Weeks", () => {
  it("comes from experience, plus time already logged, with a floor", () => {
    expect(t0Weeks({ experience: "BEGINNER", firstWorkoutDate: null }, TODAY)).toBe(12);
    expect(t0Weeks({ experience: "INTERMEDIATE", firstWorkoutDate: null }, TODAY)).toBe(78);
    expect(t0Weeks({ experience: "ADVANCED", firstWorkoutDate: addDays(TODAY, -70) }, TODAY)).toBe(270);
    expect(t0Weeks({ experience: null, firstWorkoutDate: null }, TODAY)).toBe(26);
    expect(t0Weeks({ experience: "BEGINNER", firstWorkoutDate: "2027-01-01" }, TODAY)).toBe(12);
  });
});

describe("forecastE1rm", () => {
  it("needs >= 6 sessions over >= 3 weeks", () => {
    expect(forecastE1rm(input([]))).toMatchObject({ status: "insufficient", reason: "sessions", haveSessions: 0, haveWeeks: 0, needSessions: 6, needWeeks: 3 });
    expect(forecastE1rm(input(points(5, () => 100)))).toMatchObject({ status: "insufficient", reason: "sessions", haveSessions: 5, haveWeeks: 4 });
    expect(forecastE1rm(input(points(8, () => 100, { everyDays: 2 })))).toMatchObject({ status: "insufficient", reason: "span", haveSessions: 8, haveWeeks: 2 });
    expect(forecastE1rm(input(points(6, () => 100, { everyDays: 5 })))).toMatchObject({ status: "ok" });
  });
  it("reports a layoff: ongoing, or too little data since one", () => {
    expect(forecastE1rm(input(points(10, () => 100, { end: "2026-08-01" })))).toMatchObject({ status: "insufficient", reason: "layoff" });
    const afterLayoff = [...points(10, () => 100, { end: "2026-07-01" }), ...points(3, () => 100, { everyDays: 7 })];
    expect(forecastE1rm(input(afterLayoff))).toMatchObject({ status: "insufficient", reason: "layoff", haveSessions: 3 });
    const shortSpan = [...points(10, () => 100, { end: "2026-07-01" }), ...points(7, () => 100, { everyDays: 1 })];
    expect(forecastE1rm(input(shortSpan))).toMatchObject({ status: "insufficient", reason: "layoff" });
  });
  it("forecasts up to 12 weeks with ordered 50% and 80% bands", () => {
    const res = forecastE1rm(input(points(12, (i) => 100 + 1.5 * i)));
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.points).toHaveLength(12);
    expect(res.points[0]!.localDate).toBe(addDays(TODAY, 7));
    for (const p of res.points) {
      expect(p.low80).toBeLessThanOrEqual(p.low50);
      expect(p.low50).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.high50);
      expect(p.high50).toBeLessThanOrEqual(p.high80);
    }
    expect(res.points[11]!.p50).toBeGreaterThan(res.points[0]!.p50);
    expect(res.model).toMatchObject({ usedSessions: 12, excluded: { deload: 0, outliers: 0, beforeLayoff: 0 }, t0Weeks: 78 });
    expect(res.model.slope).toBeGreaterThan(0);
    expect(res.model.sigmaKg).toBeGreaterThan(4);
  });
  it("widens the bands further out and clamps the horizon to 1-12 weeks", () => {
    const pts = points(10, (i) => 100 + i);
    const long = forecastE1rm(input(pts, { horizonWeeks: 50 }));
    const short = forecastE1rm(input(pts, { horizonWeeks: 0 }));
    if (long.status !== "ok" || short.status !== "ok") throw new Error("expected ok");
    expect(long.points).toHaveLength(12);
    expect(short.points).toHaveLength(1);
    const width = (p: { low80: number; high80: number }) => p.high80 - p.low80;
    expect(width(long.points[11]!)).toBeGreaterThan(width(long.points[0]!));
  });
  it("excludes deload sessions from the fit", () => {
    const withDeload = points(10, (i) => (i === 5 ? 60 : 100 + i), { deload: (i) => i === 5 });
    const res = forecastE1rm(input(withDeload));
    if (res.status !== "ok") throw new Error("expected ok");
    expect(res.model.excluded.deload).toBe(1);
    expect(res.model.usedSessions).toBe(9);
    const clean = forecastE1rm(input(points(10, (i) => 100 + i).filter((_, i) => i !== 5)));
    if (clean.status !== "ok") throw new Error("expected ok");
    expect(res.points[0]!.p50).toBeCloseTo(clean.points[0]!.p50, 0);
  });
  it("is a percent forecast: scaling every e1RM scales the forecast", () => {
    const a = forecastE1rm(input(points(10, (i) => 100 + 2 * i)));
    const b = forecastE1rm(input(points(10, (i) => 2 * (100 + 2 * i))));
    if (a.status !== "ok" || b.status !== "ok") throw new Error("expected ok");
    expect(b.points[5]!.p50).toBeCloseTo(2 * a.points[5]!.p50, 1);
  });
  it("sex and lift do not change the percent curve; experience does", () => {
    const pts = points(7, (i) => 100 + i);
    const base = forecastE1rm(input(pts));
    const female = forecastE1rm(input(pts, { sex: "FEMALE", standardLift: "BENCH_PRESS" }));
    const beginner = forecastE1rm(input(pts, { experience: "BEGINNER" }));
    if (base.status !== "ok" || female.status !== "ok" || beginner.status !== "ok") throw new Error("expected ok");
    expect(female.points).toEqual(base.points);
    expect(beginner.points[11]!.p50).toBeGreaterThan(base.points[11]!.p50);
  });
  it("starts the forecast at the last level even if data is stale relative to today", () => {
    const res = forecastE1rm(input(points(8, (i) => 100 + i, { end: "2026-09-20" }), { today: "2026-09-20" }));
    expect(res.status).toBe("ok");
  });
});

describe("compareToPopulation", () => {
  it("is null when the series cannot be fitted", () => {
    expect(compareToPopulation(input(points(3, () => 100)))).toBeNull();
  });
  it("says on-track for typical progress, ahead for much faster, behind for a stalled beginner", () => {
    expect(compareToPopulation(input(points(10, (i) => 100 + 0.1 * i)))?.verdict).toBe("on-track");
    const fast = compareToPopulation(input(points(12, (i) => 100 * (1 + 0.03 * i))));
    expect(fast?.verdict).toBe("ahead");
    expect(fast!.observed.low80).toBeGreaterThan(fast!.expected.high80);
    // the population band is wide (lifters differ a lot), so only a clear decline is "behind"
    const declining = compareToPopulation(input(points(40, (i) => 100 - 1.5 * i, { everyDays: 3 }), { experience: "BEGINNER", firstWorkoutDate: null }));
    expect(declining?.verdict).toBe("behind");
    expect(declining!.observed.high80).toBeLessThan(declining!.expected.low80);
    expect(compareToPopulation(input(points(40, () => 100, { everyDays: 3 }), { experience: "BEGINNER" }))?.verdict).toBe("on-track");
  });
});

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
