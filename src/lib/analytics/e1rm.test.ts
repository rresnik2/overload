import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { estimate1RM } from "./e1rm";
import { effectiveLoadKg } from "./load";

describe("estimate1RM", () => {
  it("a single rep with no RIR is the weight itself", () => {
    expect(estimate1RM({ weightKg: 140, reps: 1 })).toEqual({ e1rmKg: 140, confidence: "high", formula: "EPLEY", effectiveReps: 1 });
    expect(estimate1RM({ weightKg: 140, reps: 1, rir: 0 })?.e1rmKg).toBe(140);
  });

  it("Epley: w(1 + r/30) with RIR folded into r", () => {
    expect(estimate1RM({ weightKg: 100, reps: 5 })?.e1rmKg).toBe(116.667);
    expect(estimate1RM({ weightKg: 100, reps: 5, rir: 2 })?.e1rmKg).toBe(123.333); // r = 7
    expect(estimate1RM({ weightKg: 80, reps: 10 })?.e1rmKg).toBe(106.667);
    expect(estimate1RM({ weightKg: 100, reps: 1, rir: 2 })?.e1rmKg).toBe(110); // r = 3
  });

  it("Brzycki: 36w / (37 - r)", () => {
    expect(estimate1RM({ weightKg: 100, reps: 5, formula: "BRZYCKI" })?.e1rmKg).toBe(112.5);
    expect(estimate1RM({ weightKg: 100, reps: 1, formula: "BRZYCKI" })?.e1rmKg).toBe(100);
  });

  it("flags low confidence above 10 effective reps and gives no estimate above 12", () => {
    expect(estimate1RM({ weightKg: 60, reps: 10 })?.confidence).toBe("high");
    expect(estimate1RM({ weightKg: 60, reps: 10, rir: 1 })?.confidence).toBe("low"); // r = 11
    expect(estimate1RM({ weightKg: 60, reps: 12 })?.confidence).toBe("low");
    expect(estimate1RM({ weightKg: 60, reps: 12, rir: 1 })).toBeNull(); // r = 13
    expect(estimate1RM({ weightKg: 60, reps: 13 })).toBeNull();
  });

  it("returns null for impossible inputs", () => {
    expect(estimate1RM({ weightKg: 0, reps: 5 })).toBeNull();
    expect(estimate1RM({ weightKg: -10, reps: 5 })).toBeNull();
    expect(estimate1RM({ weightKg: 100, reps: 0 })).toBeNull();
    expect(estimate1RM({ weightKg: Number.NaN, reps: 5 })).toBeNull();
    expect(estimate1RM({ weightKg: 100, reps: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it("treats null/negative RIR as 0", () => {
    expect(estimate1RM({ weightKg: 100, reps: 5, rir: null })?.e1rmKg).toBe(estimate1RM({ weightKg: 100, reps: 5, rir: 0 })?.e1rmKg);
    expect(estimate1RM({ weightKg: 100, reps: 5, rir: -3 })?.e1rmKg).toBe(116.667);
  });

  it("property: e1RM never decreases as load rises (fixed reps/RIR)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 400, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 0, max: 4, noNaN: true }),
        fc.constantFrom("EPLEY" as const, "BRZYCKI" as const),
        (w, dw, reps, rir, formula) => {
          const a = estimate1RM({ weightKg: w, reps, rir, formula });
          const b = estimate1RM({ weightKg: w + dw, reps, rir, formula });
          if (a && b) expect(b.e1rmKg).toBeGreaterThanOrEqual(a.e1rmKg);
        },
      ),
    );
  });

  it("property: e1RM never decreases as reps rise (fixed load/RIR)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 400, noNaN: true }),
        fc.integer({ min: 1, max: 11 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.constantFrom("EPLEY" as const, "BRZYCKI" as const),
        (w, reps, rir, formula) => {
          const a = estimate1RM({ weightKg: w, reps, rir, formula });
          const b = estimate1RM({ weightKg: w, reps: reps + 1, rir, formula });
          if (a && b) expect(b.e1rmKg).toBeGreaterThanOrEqual(a.e1rmKg);
        },
      ),
    );
  });

  it("property: the estimate is never below the lifted weight", () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 400, noNaN: true }), fc.integer({ min: 1, max: 12 }), (w, reps) => {
        const e = estimate1RM({ weightKg: w, reps });
        if (e) expect(e.e1rmKg).toBeGreaterThanOrEqual(Math.round(w * 1000) / 1000 - 1e-9);
      }),
    );
  });
});

describe("effectiveLoadKg", () => {
  const base = { isUnilateral: false } as const;

  it("TOTAL and STACK pass the entered number through", () => {
    expect(effectiveLoadKg({ ...base, loadType: "TOTAL", weightKg: 100 })).toBe(100);
    expect(effectiveLoadKg({ ...base, loadType: "STACK", weightKg: 55 })).toBe(55);
    expect(effectiveLoadKg({ ...base, loadType: "TOTAL", weightKg: null })).toBeNull();
  });

  it("PER_IMPLEMENT doubles unless the exercise is unilateral", () => {
    expect(effectiveLoadKg({ loadType: "PER_IMPLEMENT", weightKg: 30, isUnilateral: false })).toBe(60);
    expect(effectiveLoadKg({ loadType: "PER_IMPLEMENT", weightKg: 30, isUnilateral: true })).toBe(30);
  });

  it("PLATES_PER_SIDE is 2 x entry + the machine's base load", () => {
    expect(effectiveLoadKg({ ...base, loadType: "PLATES_PER_SIDE", weightKg: 90, baseLoadKg: 50 })).toBe(230);
    expect(effectiveLoadKg({ ...base, loadType: "PLATES_PER_SIDE", weightKg: 90 })).toBe(180);
  });

  it("BODYWEIGHT_PLUS is bodyweight x factor + added load; unknown bodyweight -> null", () => {
    expect(effectiveLoadKg({ ...base, loadType: "BODYWEIGHT_PLUS", weightKg: 10, bodyweightKg: 80 })).toBe(90);
    expect(effectiveLoadKg({ ...base, loadType: "BODYWEIGHT_PLUS", weightKg: null, bodyweightKg: 80 })).toBe(80);
    expect(effectiveLoadKg({ ...base, loadType: "BODYWEIGHT_PLUS", weightKg: 0, bodyweightKg: 80, bodyweightFactor: 0.64 })).toBe(51.2);
    expect(effectiveLoadKg({ ...base, loadType: "BODYWEIGHT_PLUS", weightKg: 10 })).toBeNull();
  });

  it("NONE has no load", () => {
    expect(effectiveLoadKg({ ...base, loadType: "NONE", weightKg: 10 })).toBeNull();
  });

  it("rounds to storage precision (3 dp)", () => {
    expect(effectiveLoadKg({ ...base, loadType: "PER_IMPLEMENT", weightKg: 12.3456 })).toBe(24.691);
  });
});
