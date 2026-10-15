// fast-check properties (acceptance: e1RM rises with load and reps; weekly volume does not depend on set order;
// forecast bands are ordered; DOTS increases with total).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SessionPoint, SetFact } from "@/contracts/analytics";
import { addDays } from "@/lib/dates";
import { FIXTURE_EXERCISE_LIST } from "@/lib/fixtures/exercises";
import { makeSet } from "@/lib/fixtures/factories";
import { estimate1RM } from "./e1rm";
import { forecastE1rm } from "./forecast";
import { allometric, bodyweightTrend, dots, ipfGl } from "./scores";
import { weeklyMuscleVolume } from "./volume";

const exercises = FIXTURE_EXERCISE_LIST.map((e) => e.meta);
const sexes = fc.constantFrom("MALE" as const, "FEMALE" as const, "PREFER_NOT_TO_SAY" as const);

describe("e1RM properties", () => {
  it("rises with load (same reps and RIR)", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 400, noNaN: true }), fc.double({ min: 0.5, max: 50, noNaN: true }), fc.integer({ min: 2, max: 10 }), fc.integer({ min: 0, max: 2 }), fc.constantFrom("EPLEY" as const, "BRZYCKI" as const), (w, extra, reps, rir, formula) => {
        const a = estimate1RM({ weightKg: w, reps, rir, formula })!;
        const b = estimate1RM({ weightKg: w + extra, reps, rir, formula })!;
        expect(b.e1rmKg).toBeGreaterThan(a.e1rmKg);
      }),
    );
  });
  it("rises with reps (same load)", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 400, noNaN: true }), fc.integer({ min: 1, max: 10 }), fc.constantFrom("EPLEY" as const, "BRZYCKI" as const), (w, reps, formula) => {
        const a = estimate1RM({ weightKg: w, reps, formula })!;
        const b = estimate1RM({ weightKg: w, reps: reps + 1, formula })!;
        expect(b.e1rmKg).toBeGreaterThanOrEqual(a.e1rmKg);
        if (reps >= 1) expect(b.e1rmKg).toBeGreaterThan(a.e1rmKg * 0.999);
      }),
    );
  });
});

describe("weekly volume", () => {
  const setArb = fc.record({
    ex: fc.integer({ min: 0, max: exercises.length - 1 }),
    day: fc.integer({ min: -2, max: 9 }),
    rir: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
    reps: fc.integer({ min: 0, max: 15 }),
    type: fc.constantFrom("WORKING" as const, "WARMUP" as const, "DROP" as const, "AMRAP" as const),
  });
  it("does not depend on set order", () => {
    fc.assert(
      fc.property(fc.array(setArb, { maxLength: 60 }), fc.integer({ min: 0, max: 1000 }), (specs, seed) => {
        const sets: SetFact[] = specs.map((s) => makeSet({ exerciseId: exercises[s.ex]!.id, localDate: addDays("2026-10-05", s.day), rir: s.rir, reps: s.reps, setType: s.type }));
        const shuffled = [...sets].sort((a, b) => ((a.id.length * 31 + seed) % 7) - ((b.id.length * 17 + seed) % 7) || b.id.localeCompare(a.id));
        const a = weeklyMuscleVolume({ sets, exercises, weekStart: "2026-10-05", goal: "HYPERTROPHY" });
        const b = weeklyMuscleVolume({ sets: shuffled, exercises, weekStart: "2026-10-05", goal: "HYPERTROPHY" });
        expect(b).toEqual(a);
        expect(weeklyMuscleVolume({ sets: [...sets].reverse(), exercises, weekStart: "2026-10-05", goal: "HYPERTROPHY" })).toEqual(a);
      }),
    );
  });
});

describe("forecast bands", () => {
  it("are ordered low80 <= low50 <= p50 <= high50 <= high80 for any fitted series", () => {
    const pointsArb = fc.array(fc.double({ min: 20, max: 300, noNaN: true }), { minLength: 6, maxLength: 40 });
    fc.assert(
      fc.property(pointsArb, fc.integer({ min: 4, max: 10 }), fc.integer({ min: 1, max: 12 }), fc.constantFrom(null, "BEGINNER" as const, "INTERMEDIATE" as const, "ADVANCED" as const), (values, everyDays, horizon, experience) => {
        const points: SessionPoint[] = values.map((e1rmKg, i) => ({ localDate: addDays("2026-10-11", -everyDays * (values.length - 1 - i)), e1rmKg, seriesKey: "s", isDeload: false }));
        const res = forecastE1rm({ points, sex: "FEMALE", experience, standardLift: null, firstWorkoutDate: null, today: "2026-10-11", horizonWeeks: horizon });
        if (res.status !== "ok") return;
        expect(res.points).toHaveLength(horizon);
        for (const p of res.points) {
          expect(p.low80).toBeLessThanOrEqual(p.low50);
          expect(p.low50).toBeLessThanOrEqual(p.p50);
          expect(p.p50).toBeLessThanOrEqual(p.high50);
          expect(p.high50).toBeLessThanOrEqual(p.high80);
          expect(p.low80).toBeGreaterThanOrEqual(0);
        }
      }),
    );
  });
});

describe("scores", () => {
  it("DOTS and IPF GL increase with total", () => {
    fc.assert(
      fc.property(fc.double({ min: 50, max: 1000, noNaN: true }), fc.double({ min: 1, max: 100, noNaN: true }), fc.double({ min: 45, max: 200, noNaN: true }), sexes, (total, extra, bw, sex) => {
        expect(dots({ totalKg: total + extra, bodyweightKg: bw, sex })!).toBeGreaterThan(dots({ totalKg: total, bodyweightKg: bw, sex })!);
        expect(ipfGl({ totalKg: total + extra, bodyweightKg: bw, sex })!).toBeGreaterThan(ipfGl({ totalKg: total, bodyweightKg: bw, sex })!);
      }),
    );
  });
  it("allometric strength rises with the lift and falls with bodyweight", () => {
    fc.assert(
      fc.property(fc.double({ min: 20, max: 400, noNaN: true }), fc.double({ min: 50, max: 150, noNaN: true }), (lift, bw) => {
        expect(allometric({ liftKg: lift + 10, bodyweightKg: bw })).toBeGreaterThan(allometric({ liftKg: lift, bodyweightKg: bw }));
        expect(allometric({ liftKg: lift, bodyweightKg: bw + 10 })).toBeLessThan(allometric({ liftKg: lift, bodyweightKg: bw }));
      }),
    );
  });
  it("the bodyweight trend stays within the range of the data", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 40, max: 200, noNaN: true }), { minLength: 1, maxLength: 30 }), (ws) => {
        const pts = ws.map((weightKg, i) => ({ localDate: addDays("2026-09-01", i), weightKg }));
        for (const t of bodyweightTrend(pts)) {
          expect(t.trendKg).toBeGreaterThanOrEqual(Math.min(...ws) - 0.01);
          expect(t.trendKg).toBeLessThanOrEqual(Math.max(...ws) + 0.01);
        }
      }),
    );
  });
});
