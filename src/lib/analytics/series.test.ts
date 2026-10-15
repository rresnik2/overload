import { describe, expect, it } from "vitest";
import { makeSet } from "@/lib/fixtures/factories";
import { sessionBestE1rm, setE1rm } from "./series";

describe("sessionBestE1rm", () => {
  it("takes the best e1RM per session, oldest first, excluding warm-ups, drops and sets above 10 reps", () => {
    const sets = [
      makeSet({ localDate: "2026-10-06", load: 100, reps: 5, rir: 2 }), // 100 * (1 + 7/30) = 123.333
      makeSet({ localDate: "2026-10-06", load: 110, reps: 5, rir: 1 }), // 132
      makeSet({ localDate: "2026-10-06", load: 200, reps: 3, setType: "WARMUP" }),
      makeSet({ localDate: "2026-10-06", load: 200, reps: 3, setType: "DROP" }),
      makeSet({ localDate: "2026-10-06", load: 50, reps: 11, rir: 0 }),
      makeSet({ localDate: "2026-10-01", load: 100, reps: 5, rir: 0 }),
    ];
    const points = sessionBestE1rm(sets);
    expect(points.map((p) => [p.localDate, p.e1rmKg])).toEqual([
      ["2026-10-01", 116.667],
      ["2026-10-06", 132],
    ]);
  });
  it("skips sets with no estimate and carries the deload flag", () => {
    const sets = [
      makeSet({ localDate: "2026-10-06", load: 100, reps: 5, e1rmKg: null, effectiveLoadKg: null }),
      makeSet({ localDate: "2026-10-06", load: 100, reps: null }),
      makeSet({ localDate: "2026-10-07", load: 100, reps: 0 }),
      makeSet({ localDate: "2026-10-08", load: 100, reps: 5, isDeload: true }),
    ];
    const points = sessionBestE1rm(sets);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ localDate: "2026-10-08", isDeload: true });
  });
  it("recomputes with the requested formula and never merges series", () => {
    const a = makeSet({ localDate: "2026-10-06", load: 100, reps: 5, rir: 0, exerciseId: "ex-a" });
    const b = makeSet({ localDate: "2026-10-06", load: 100, reps: 5, rir: 0, exerciseId: "ex-b", machineProfileId: "m1" });
    const epley = sessionBestE1rm([a, b]);
    expect(epley).toHaveLength(2);
    expect(epley.map((p) => p.seriesKey)).toEqual(["ex-a", "ex-b:m1"]);
    const brzycki = sessionBestE1rm([a], { formula: "BRZYCKI" });
    expect(brzycki[0]!.e1rmKg).toBe(112.5); // 36 * 100 / 32
  });
  it("setE1rm falls back to the load when no e1RM is stored", () => {
    expect(setE1rm(makeSet({ effectiveLoadKg: null, e1rmKg: null }))).toBeNull();
    const noStored = { ...makeSet({ load: 100, reps: 5, rir: 0 }), e1rmKg: null };
    expect(setE1rm(noStored)).toBe(116.667);
    expect(setE1rm(noStored, "BRZYCKI")).toBe(112.5);
  });
});
