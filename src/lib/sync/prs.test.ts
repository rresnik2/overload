import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PrCandidate, PrSetInput } from "@/contracts/prs";
import type { PrType, SetType } from "@/contracts/enums";
import { computeSeriesPrs, detectNewPrs } from "./prs";

let n = 0;
function set(over: Partial<PrSetInput> & { load?: number | null; reps?: number | null }): PrSetInput {
  const { load = 100, reps = 5, ...rest } = over;
  n += 1;
  return {
    id: `s${String(n).padStart(4, "0")}`,
    workoutId: "w1",
    exerciseId: "e1",
    machineProfileId: null,
    seriesKey: "e1",
    setType: "WORKING",
    completedAt: `2026-10-12T17:${String(n % 60).padStart(2, "0")}:00.000Z`,
    reps,
    effectiveLoadKg: load,
    e1rmKg: load != null && reps != null ? Math.round(load * (1 + reps / 30) * 1000) / 1000 : null,
    ...rest,
  };
}
const find = (prs: PrCandidate[], type: PrType, reps = 0) => prs.find((p) => p.type === type && p.reps === reps);

describe("computeSeriesPrs", () => {
  it("picks the best per type with the right set", () => {
    const sets = [
      set({ id: "a", load: 100, reps: 5, completedAt: "2026-10-12T10:00:00.000Z" }), // e1rm 116.667, vol 500
      set({ id: "b", load: 80, reps: 10, completedAt: "2026-10-12T10:05:00.000Z" }), // e1rm 106.667, vol 800
      set({ id: "c", load: null, reps: 25, completedAt: "2026-10-12T10:10:00.000Z" }), // no-load reps
    ];
    const prs = computeSeriesPrs(sets);
    expect(find(prs, "E1RM")).toMatchObject({ setId: "a", value: 116.667 });
    expect(find(prs, "MAX_LOAD")).toMatchObject({ setId: "a", value: 100 });
    expect(find(prs, "REP_MAX", 5)).toMatchObject({ setId: "a", value: 100 });
    expect(find(prs, "REP_MAX", 10)).toMatchObject({ setId: "b", value: 80 });
    expect(find(prs, "MAX_SET_VOLUME")).toMatchObject({ setId: "b", value: 800 });
    expect(find(prs, "MAX_SESSION_VOLUME")).toMatchObject({ setId: null, value: 1300, workoutId: "w1", achievedAt: "2026-10-12T10:05:00.000Z" });
    expect(find(prs, "MAX_REPS")).toMatchObject({ setId: "c", value: 25 });
  });

  it("ignores warm-up, drop and planned sets", () => {
    const sets = [
      set({ id: "w", setType: "WARMUP", load: 200, reps: 1 }),
      set({ id: "d", setType: "DROP", load: 190, reps: 1 }),
      set({ id: "p", completedAt: null, load: 300, reps: 1 }),
    ];
    expect(computeSeriesPrs(sets)).toEqual([]);
  });

  it("ties keep the earliest achievement", () => {
    const sets = [
      set({ id: "late", load: 100, reps: 5, completedAt: "2026-10-13T10:00:00.000Z" }),
      set({ id: "early", load: 100, reps: 5, completedAt: "2026-10-12T10:00:00.000Z" }),
    ];
    const prs = computeSeriesPrs(sets);
    expect(find(prs, "MAX_LOAD")?.setId).toBe("early");
    expect(find(prs, "REP_MAX", 5)?.setId).toBe("early");
  });

  it("session volume is per workout and the best session wins", () => {
    const sets = [
      set({ id: "a", workoutId: "w1", load: 100, reps: 5 }),
      set({ id: "b", workoutId: "w1", load: 100, reps: 5 }),
      set({ id: "c", workoutId: "w2", load: 100, reps: 12 }),
    ];
    expect(find(computeSeriesPrs(sets), "MAX_SESSION_VOLUME")).toMatchObject({ workoutId: "w2", value: 1200 });
  });

  it("keeps series separate when handed several", () => {
    const sets = [set({ seriesKey: "e1", load: 100 }), set({ seriesKey: "e1:m1", machineProfileId: "m1", load: 200 })];
    const prs = computeSeriesPrs(sets);
    expect(prs.filter((p) => p.type === "MAX_LOAD").map((p) => [p.seriesKey, p.value])).toEqual([
      ["e1", 100],
      ["e1:m1", 200],
    ]);
  });
});

describe("detectNewPrs", () => {
  const history = [
    set({ id: "h1", load: 100, reps: 5, workoutId: "w0", completedAt: "2026-10-01T10:00:00.000Z" }),
    set({ id: "h2", load: 90, reps: 8, workoutId: "w0", completedAt: "2026-10-01T10:05:00.000Z" }),
  ];

  it("reports strictly better records only", () => {
    const heavier = set({ id: "n1", load: 105, reps: 5, workoutId: "w1" });
    const types = detectNewPrs(history, heavier).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(["E1RM", "MAX_LOAD", "REP_MAX"]));
    const weaker = set({ id: "n2", load: 60, reps: 5, workoutId: "w1" });
    expect(detectNewPrs(history, weaker).map((c) => c.type)).toEqual([]);
    const equal = set({ id: "n3", load: 100, reps: 5, workoutId: "w1" });
    expect(detectNewPrs(history, equal).filter((c) => c.type === "MAX_LOAD")).toEqual([]);
  });

  it("a new rep count is a REP_MAX record; warm-ups and planned sets never are", () => {
    const six = set({ id: "n4", load: 95, reps: 6, workoutId: "w1" });
    expect(detectNewPrs(history, six).some((c) => c.type === "REP_MAX" && c.reps === 6)).toBe(true);
    expect(detectNewPrs(history, set({ setType: "WARMUP", load: 500, reps: 1 }))).toEqual([]);
    expect(detectNewPrs(history, set({ completedAt: null, load: 500, reps: 1 }))).toEqual([]);
  });

  it("the first counted set of a series is not announced", () => {
    expect(detectNewPrs([], set({ load: 100, reps: 5 }))).toEqual([]);
    expect(detectNewPrs([set({ setType: "WARMUP" })], set({ load: 100, reps: 5 }))).toEqual([]);
  });

  it("does not count the new set against itself", () => {
    const heavier = set({ id: "n5", load: 105, reps: 5 });
    expect(detectNewPrs([...history, heavier], heavier).length).toBeGreaterThan(0);
  });
});

describe("PR properties", () => {
  const setArb = fc
    .record({
      load: fc.option(fc.integer({ min: 1, max: 300 }), { nil: null }),
      reps: fc.option(fc.integer({ min: 0, max: 20 }), { nil: null }),
      setType: fc.constantFrom<SetType>("WARMUP", "WORKING", "DROP", "AMRAP"),
      planned: fc.boolean(),
      workout: fc.constantFrom("w1", "w2", "w3"),
      minute: fc.integer({ min: 0, max: 59 }),
    })
    .map((x) =>
      set({
        load: x.load,
        reps: x.reps,
        setType: x.setType,
        workoutId: x.workout,
        completedAt: x.planned ? null : `2026-10-12T10:${String(x.minute).padStart(2, "0")}:00.000Z`,
      }),
    );
  const setsArb = fc.array(setArb, { maxLength: 15 }).map((sets) => sets.map((s, i) => ({ ...s, id: `p${i}` })));

  it("does not depend on set order", () => {
    fc.assert(
      fc.property(setsArb, (sets) => {
        expect(computeSeriesPrs([...sets].reverse())).toEqual(computeSeriesPrs(sets));
      }),
    );
  });

  it("is unchanged by adding sets that never count", () => {
    fc.assert(
      fc.property(setsArb, (sets) => {
        const noise = [
          set({ id: "n1", setType: "WARMUP", load: 999, reps: 1 }),
          set({ id: "n2", setType: "DROP", load: 999, reps: 1 }),
          set({ id: "n3", completedAt: null, load: 999, reps: 1 }),
        ];
        expect(computeSeriesPrs([...sets, ...noise])).toEqual(computeSeriesPrs(sets));
      }),
    );
  });

  it("adding a set never lowers a record", () => {
    fc.assert(
      fc.property(setsArb, setArb, (sets, extra) => {
        const before = new Map(computeSeriesPrs(sets).map((p) => [`${p.type}:${p.reps}`, p.value]));
        for (const p of computeSeriesPrs([...sets, { ...extra, id: "extra" }])) {
          const prev = before.get(`${p.type}:${p.reps}`);
          if (prev !== undefined) expect(p.value).toBeGreaterThanOrEqual(prev);
        }
      }),
    );
  });

  it("detectNewPrs only ever reports values above the prior best", () => {
    fc.assert(
      fc.property(setsArb, setArb, (sets, extra) => {
        const newSet = { ...extra, id: "extra" };
        const before = new Map(computeSeriesPrs(sets).map((p) => [`${p.type}:${p.reps}`, p.value]));
        for (const c of detectNewPrs(sets, newSet)) {
          const prev = before.get(`${c.type}:${c.reps}`);
          if (prev !== undefined) expect(c.value).toBeGreaterThan(prev);
        }
      }),
    );
  });
});
