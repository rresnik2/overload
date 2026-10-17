import { describe, expect, it } from "vitest";
import type { SessionPoint } from "@/contracts/analytics";
import { addDays } from "@/lib/dates";
import { makeInput, makeSet, sessionsOf } from "@/lib/fixtures/factories";
import { FIXTURE_EXERCISES } from "@/lib/fixtures/exercises";
import { axisTicks, buildTodayLifts, chartWindow, fourWeekChange, pickFocusLift } from "./lifts";

const TODAY = "2026-10-12";
const pt = (daysAgo: number, e1rmKg: number, isDeload = false): SessionPoint => ({ localDate: addDays(TODAY, -daysAgo), e1rmKg, seriesKey: "s", isDeload });
const id = (k: keyof typeof FIXTURE_EXERCISES) => FIXTURE_EXERCISES[k].meta.id;

describe("fourWeekChange", () => {
  it("is the latest estimate minus the last session at least 28 days before it", () => {
    expect(fourWeekChange([pt(60, 90), pt(35, 95), pt(20, 98), pt(7, 100)])).toEqual({ e1rmKg: 100, localDate: addDays(TODAY, -7), changeKg: 5 });
  });
  it("is exactly 28 days inclusive, and 0 when the estimate sat still", () => {
    expect(fourWeekChange([pt(35, 105), pt(7, 105)])?.changeKg).toBe(0);
    expect(fourWeekChange([pt(27, 100), pt(0, 110)])?.changeKg).toBeNull();
  });
  it("is negative after a drop and rounds to 0.1 kg", () => {
    expect(fourWeekChange([pt(40, 100.04), pt(5, 97.5)])?.changeKg).toBe(-2.5);
    expect(fourWeekChange([pt(40, 100), pt(5, 100.26)])?.changeKg).toBe(0.3);
  });
  it("skips deload sessions, but uses them when nothing else exists", () => {
    expect(fourWeekChange([pt(50, 100), pt(14, 105), pt(3, 80, true)])).toMatchObject({ e1rmKg: 105, changeKg: 5 });
    expect(fourWeekChange([pt(3, 80, true)])).toMatchObject({ e1rmKg: 80, changeKg: null });
  });
  it("is null with no sessions, and has no baseline with a single one", () => {
    expect(fourWeekChange([])).toBeNull();
    expect(fourWeekChange([pt(2, 90)])).toMatchObject({ e1rmKg: 90, changeKg: null });
  });
});

describe("pickFocusLift", () => {
  const c = (lift: "SQUAT" | "BENCH_PRESS" | "DEADLIFT" | "OVERHEAD_PRESS", stalled: boolean, stallChangePct: number | null, lastDaysAgo = 3) => ({
    lift,
    stalled,
    stallChangePct,
    points: [pt(lastDaysAgo, 100)],
  });
  it("prefers a stalled lift, the one with the lowest change first", () => {
    expect(pickFocusLift([c("SQUAT", true, 2), c("BENCH_PRESS", false, 8), c("DEADLIFT", true, -1)])).toBe("DEADLIFT");
  });
  it("is bench when nothing stalled", () => {
    expect(pickFocusLift([c("SQUAT", false, 9), c("BENCH_PRESS", false, 8)])).toBe("BENCH_PRESS");
  });
  it("falls back to the lift trained last when bench has no history", () => {
    expect(pickFocusLift([c("SQUAT", false, 9, 10), c("OVERHEAD_PRESS", false, null, 2)])).toBe("OVERHEAD_PRESS");
  });
  it("is null without any lift", () => {
    expect(pickFocusLift([])).toBeNull();
  });
});

describe("chartWindow and axisTicks", () => {
  it("keeps the last 12 weeks", () => {
    const w = chartWindow([pt(100, 90), pt(84, 91), pt(30, 95), pt(0, 99)], TODAY);
    expect(w.from).toBe(addDays(TODAY, -84));
    expect(w.points.map((p) => p.e1rmKg)).toEqual([91, 95, 99]);
  });
  it("leaves deload sessions out of the chart", () => {
    expect(chartWindow([pt(30, 95), pt(20, 70, true), pt(10, 99)], TODAY).points.map((p) => p.e1rmKg)).toEqual([95, 99]);
  });
  it("gives round ticks that cover the range", () => {
    expect(axisTicks(97, 108)).toEqual([95, 100, 105, 110]);
    expect(axisTicks(100, 142.5)).toEqual([100, 120, 140, 160]);
    expect(axisTicks(100, 100)).toEqual([100]);
  });
});

describe("buildTodayLifts", () => {
  it("fills the tiles for lifts with history and leaves the others empty", () => {
    const sets = [
      ...sessionsOf(id("bench"), 8, (i) => 90 + i * 2, { endDate: "2026-10-10" }),
      ...sessionsOf(id("squat"), 3, (i) => 120 + i, { endDate: "2026-10-09" }),
    ];
    const r = buildTodayLifts(makeInput({ today: TODAY, sets }));
    expect(r.tiles.map((t) => t.lift)).toEqual(["SQUAT", "BENCH_PRESS", "DEADLIFT", "OVERHEAD_PRESS"]);
    const bench = r.tiles.find((t) => t.lift === "BENCH_PRESS")!;
    expect(bench.e1rmKg).toBeCloseTo(104, 0);
    expect(bench.changeKg).toBeCloseTo(8, 0);
    expect(r.tiles.find((t) => t.lift === "DEADLIFT")).toMatchObject({ seriesKey: null, e1rmKg: null, changeKg: null });
    expect(r.tiles.find((t) => t.lift === "OVERHEAD_PRESS")?.e1rmKg).toBeNull();
    expect(r.tiles.find((t) => t.lift === "SQUAT")?.changeKg).toBeNull(); // three weekly sessions: no 4-week baseline
    expect(r.chart?.lift).toBe("BENCH_PRESS");
    expect(r.chart?.band).toBeNull();
  });

  it("charts the stalled lift with its band, even when bench is moving", () => {
    const sets = [
      ...sessionsOf(id("bench"), 12, (i) => 90 + i * 2, { endDate: "2026-10-10" }),
      ...sessionsOf(id("squat"), 12, () => 140, { endDate: "2026-10-10" }),
    ];
    const r = buildTodayLifts(makeInput({ today: TODAY, sets }));
    expect(r.chart).toMatchObject({ lift: "SQUAT", stalled: true });
    expect(r.chart?.band).toMatchObject({ weeks: 6, to: TODAY });
    expect(r.tiles.find((t) => t.lift === "SQUAT")?.changeKg).toBe(0);
  });

  it("shades the last 4 weeks when the change is exactly flat but the lift is not a detected stall", () => {
    const at = (daysAgo: number, load: number) => makeSet({ exerciseId: id("bench"), localDate: addDays(TODAY, -daysAgo), load, reps: 5, rir: 0 });
    const r = buildTodayLifts(makeInput({ today: TODAY, sets: [at(70, 60), at(60, 60), at(40, 90), at(5, 90)] }));
    expect(r.tiles.find((t) => t.lift === "BENCH_PRESS")?.changeKg).toBe(0);
    expect(r.chart).toMatchObject({ lift: "BENCH_PRESS", stalled: false });
    expect(r.chart?.band).toEqual({ from: addDays(TODAY, -28), to: TODAY, weeks: 4 });
  });

  it("ignores machines and other exercises for the tiles", () => {
    const sets = [...sessionsOf(id("legPress"), 6, () => 200), ...sessionsOf(id("row"), 6, () => 100)];
    const r = buildTodayLifts(makeInput({ today: TODAY, sets }));
    expect(r.tiles.every((t) => t.e1rmKg === null)).toBe(true);
    expect(r.chart).toBeNull();
  });

  it("uses the most recently trained series when a lift has two", () => {
    const sets = [
      makeSet({ exerciseId: id("bench"), localDate: "2026-09-01", load: 100, reps: 5, rir: 0 }),
      makeSet({ exerciseId: id("bench"), machineProfileId: "mp-1", localDate: "2026-10-05", load: 90, reps: 5, rir: 0 }),
    ];
    const r = buildTodayLifts(makeInput({ today: TODAY, sets }));
    expect(r.tiles.find((t) => t.lift === "BENCH_PRESS")?.seriesKey).toBe(`${id("bench")}:mp-1`);
  });
});
