import { describe, expect, it } from "vitest";
import type { SessionPoint, SetFact } from "@/contracts/analytics";
import { addDays } from "@/lib/dates";
import { makeSet } from "@/lib/fixtures/factories";
import { detectStall, evaluateProgression, lastWorkingSetPerSession, suggestProgression } from "./progression";

const TODAY = "2026-10-11";
const pt = (daysAgo: number, e1rmKg: number, isDeload = false): SessionPoint => ({ localDate: addDays(TODAY, -daysAgo), e1rmKg, seriesKey: "s", isDeload });

describe("detectStall", () => {
  const flat = [70, 63, 56, 49, 42, 35, 28, 21, 14, 7].map((d) => pt(d, 100));
  it("is stalled when the last 6 weeks did not beat the 6 before by ~5%", () => {
    const r = detectStall([...[84, 77, 70].map((d) => pt(d, 100)), pt(35, 102), pt(14, 103), pt(7, 101)], TODAY);
    expect(r.stalled).toBe(true);
    expect(r.changePct).toBe(3);
    expect(r.sessions).toBe(5);
    expect(detectStall(flat, TODAY).stalled).toBe(true);
  });
  it("is not stalled with >= 5% progress", () => {
    const rising = [80, 70, 60, 50, 40, 30, 20, 10].map((d, i) => pt(d, 100 + 2 * i));
    const r = detectStall(rising, TODAY);
    expect(r.stalled).toBe(false);
    expect(r.changePct).toBeGreaterThan(5);
  });
  it("ignores deload sessions", () => {
    const pts = [...[80, 70, 60].map((d) => pt(d, 100)), pt(30, 140, true), pt(20, 100), pt(10, 101)];
    expect(detectStall(pts, TODAY).stalled).toBe(true);
    expect(detectStall(pts, TODAY).sessions).toBe(5);
  });
  it("needs >= 2 sessions in each window, and a drop counts as no progress", () => {
    expect(detectStall([], TODAY)).toEqual({ stalled: false, sessions: 0, weeksSpanned: 0, changePct: null });
    expect(detectStall([pt(50, 100), pt(10, 120), pt(5, 121)], TODAY)).toMatchObject({ stalled: false, changePct: null });
    expect(detectStall([pt(50, 120), pt(55, 120), pt(10, 100), pt(5, 100)], TODAY)).toMatchObject({ stalled: true, changePct: -16.7 });
  });
});

const sess = (daysAgo: number, reps: number[], load = 60): SetFact[] =>
  reps.map((r) => makeSet({ localDate: addDays(TODAY, -daysAgo), load, reps: r, rir: 1 }));

const input = (over: Partial<Parameters<typeof suggestProgression>[0]> = {}) => ({
  sets: [...sess(7, [10, 10, 14]), ...sess(2, [10, 11, 14])],
  repMin: 8, repMax: 12, modality: "FREE_WEIGHT" as const, incrementKg: 2.5, currentLoadKg: 60, ...over,
});

describe("lastWorkingSetPerSession", () => {
  it("takes the last working set of each session and skips warm-ups and drop sets", () => {
    const sets = [
      ...sess(7, [10, 12]),
      makeSet({ localDate: addDays(TODAY, -7), setType: "DROP", reps: 20 }),
      makeSet({ localDate: addDays(TODAY, -7), setType: "WARMUP", reps: 5 }),
      makeSet({ localDate: addDays(TODAY, -2), reps: null }),
      ...sess(2, [9]),
    ];
    expect(lastWorkingSetPerSession(sets).map((s) => s.reps)).toEqual([12, 9]);
  });
});

describe("suggestProgression (2-for-2)", () => {
  it("adds load when the last set beat repMax by 2 in two sessions in a row", () => {
    const r = suggestProgression(input());
    expect(r).toMatchObject({ kind: "add_load", nextLoadKg: 62.5, nextRepTarget: 8 });
  });
  it("uses several small jumps when one is under 2% of the load", () => {
    expect(suggestProgression(input({ incrementKg: 0.5, currentLoadKg: 100 })).nextLoadKg).toBe(102);
  });
  it("needs two sessions at the same load", () => {
    expect(suggestProgression(input({ sets: sess(2, [14, 14, 14]) })).kind).toBe("hold");
    const changed = [...sess(7, [14], 57.5), ...sess(2, [14], 60)];
    expect(suggestProgression(input({ sets: changed })).kind).toBe("hold");
  });
  it("adds reps while the last set is under the top of the range", () => {
    const r = suggestProgression(input({ sets: [...sess(7, [9, 9, 9]), ...sess(2, [9, 9, 10])] }));
    expect(r).toMatchObject({ kind: "add_reps", nextLoadKg: 60, nextRepTarget: 11 });
    expect(suggestProgression(input({ sets: [...sess(7, [5]), ...sess(2, [5])] })).nextRepTarget).toBe(8);
  });
  it("holds at the top of the range until the 2-for-2 is met", () => {
    const r = suggestProgression(input({ sets: [...sess(7, [12]), ...sess(2, [12])] }));
    expect(r).toMatchObject({ kind: "hold", nextRepTarget: 14, nextLoadKg: 60 });
  });
  it("holds without enough history or a usable load", () => {
    expect(suggestProgression(input({ sets: [] })).kind).toBe("hold");
    expect(suggestProgression(input({ currentLoadKg: 0 })).kind).toBe("hold");
    expect(suggestProgression(input({ incrementKg: 0 })).kind).toBe("hold");
  });
  it("machine stack jumps over 10% add reps first, then take the jump when reps allow", () => {
    const machine = (reps: number) => ({ modality: "MACHINE" as const, incrementKg: 4.5, currentLoadKg: 40, sets: [...sess(7, [reps], 40), ...sess(2, [reps], 40)] });
    const first = evaluateProgression(input(machine(14)));
    expect(first).toMatchObject({ twoForTwo: true, bigJump: true, suggestion: { kind: "add_reps", nextLoadKg: 40 } });
    expect(first.suggestion.nextRepTarget).toBeGreaterThan(14);
    expect(suggestProgression(input(machine(20))).kind).toBe("add_load");
    // a small jump on a machine is a normal add_load
    expect(suggestProgression(input({ ...machine(14), incrementKg: 2, currentLoadKg: 60, sets: [...sess(7, [14], 60), ...sess(2, [14], 60)] })).kind).toBe("add_load");
    // the same big jump on a barbell is not "reps first"
    expect(suggestProgression(input({ incrementKg: 2.5, currentLoadKg: 20, sets: [...sess(7, [14], 20), ...sess(2, [14], 20)] })).kind).toBe("add_load");
  });
  it("tolerates missing loads when comparing sessions", () => {
    const noLoad = [...sess(7, [14]), ...sess(2, [14])].map((s) => ({ ...s, effectiveLoadKg: null }));
    expect(suggestProgression(input({ sets: noLoad })).kind).toBe("add_load");
  });
});
