import { describe, expect, it } from "vitest";
import { FIXTURE_EXERCISES } from "@/lib/fixtures/exercises";
import { makeSet } from "@/lib/fixtures/factories";
import { isHardSet, volumeBand, volumeStatus, weeklyMuscleVolume } from "./volume";

const squat = FIXTURE_EXERCISES.squat.meta;
const bench = FIXTURE_EXERCISES.bench.meta;
const legPress = FIXTURE_EXERCISES.legPress.meta;
const exercises = [squat, bench, legPress];

describe("isHardSet", () => {
  const base = { setType: "WORKING" as const, rir: 2, reps: 8, durationSec: null };
  it("counts working, AMRAP and drop sets with RIR <= 4 or unrecorded", () => {
    expect(isHardSet(base)).toBe(true);
    expect(isHardSet({ ...base, rir: 4 })).toBe(true);
    expect(isHardSet({ ...base, rir: null })).toBe(true);
    expect(isHardSet({ ...base, setType: "DROP" })).toBe(true);
    expect(isHardSet({ ...base, setType: "AMRAP" })).toBe(true);
  });
  it("excludes warm-ups, easy sets and sets with no work", () => {
    expect(isHardSet({ ...base, setType: "WARMUP" })).toBe(false);
    expect(isHardSet({ ...base, rir: 5 })).toBe(false);
    expect(isHardSet({ ...base, reps: null })).toBe(false);
    expect(isHardSet({ ...base, reps: 0 })).toBe(false);
  });
  it("counts timed sets", () => {
    expect(isHardSet({ setType: "WORKING", rir: null, reps: null, durationSec: 45 })).toBe(true);
    expect(isHardSet({ setType: "WORKING", rir: null, reps: null, durationSec: 0 })).toBe(false);
  });
});

describe("volume bands", () => {
  it("defaults to 10-20 for hypertrophy and no goal; strength and general differ", () => {
    expect(volumeBand(null)).toEqual({ low: 10, high: 20 });
    expect(volumeBand("HYPERTROPHY")).toEqual({ low: 10, high: 20 });
    expect(volumeBand("STRENGTH")).toEqual({ low: 4, high: 10 });
    expect(volumeBand("GENERAL")).toEqual({ low: 4, high: 20 });
  });
  it("keeps the hypertrophy band for weight loss (volume is not cut)", () => {
    expect(volumeBand("FAT_LOSS")).toEqual(volumeBand("HYPERTROPHY"));
  });
  it("status", () => {
    const band = { low: 10, high: 20 };
    expect(volumeStatus(0, band)).toBe("none");
    expect(volumeStatus(9.5, band)).toBe("below");
    expect(volumeStatus(10, band)).toBe("within");
    expect(volumeStatus(20, band)).toBe("within");
    expect(volumeStatus(20.5, band)).toBe("above");
  });
});

describe("weeklyMuscleVolume", () => {
  const weekStart = "2026-10-05";
  const sets = [
    makeSet({ exerciseId: squat.id, localDate: "2026-10-05" }),
    makeSet({ exerciseId: squat.id, localDate: "2026-10-05" }),
    makeSet({ exerciseId: bench.id, localDate: "2026-10-07" }),
    makeSet({ exerciseId: legPress.id, localDate: "2026-10-11", machineProfileId: "m1" }),
    makeSet({ exerciseId: squat.id, localDate: "2026-10-05", setType: "WARMUP" }),
    makeSet({ exerciseId: squat.id, localDate: "2026-10-04" }), // previous Sunday
    makeSet({ exerciseId: squat.id, localDate: "2026-10-12" }), // next Monday
    makeSet({ exerciseId: squat.id, localDate: "2026-10-06", rir: 6 }),
    makeSet({ exerciseId: "unknown", localDate: "2026-10-06" }),
  ];

  it("weights primary 1.0 and secondary 0.5, machines count fully, only this ISO week", () => {
    const vol = weeklyMuscleVolume({ sets, exercises, weekStart, goal: "HYPERTROPHY" });
    const get = (m: string) => vol.find((v) => v.muscle === m)!;
    // squat x2 + leg press x1 as primary
    expect(get("QUADRICEPS")).toMatchObject({ fractionalSets: 3, hardSets: 3, directSets: 3, indirectSets: 0, status: "below" });
    // squat x2 secondary + leg press secondary
    expect(get("GLUTES")).toMatchObject({ fractionalSets: 1.5, directSets: 0, indirectSets: 3 });
    expect(get("CHEST").fractionalSets).toBe(1);
    expect(get("TRICEPS").fractionalSets).toBe(0.5);
    expect(vol.every((v) => v.band.low === 10 && v.band.high === 20)).toBe(true);
  });
  it("is ordered by fractional sets descending, with a deterministic tie-break", () => {
    const vol = weeklyMuscleVolume({ sets, exercises, weekStart, goal: null });
    for (let i = 1; i < vol.length; i++) expect(vol[i - 1]!.fractionalSets).toBeGreaterThanOrEqual(vol[i]!.fractionalSets);
    expect(vol[0]!.muscle).toBe("QUADRICEPS");
    const glutesIdx = vol.findIndex((v) => v.muscle === "GLUTES");
    const hamIdx = vol.findIndex((v) => v.muscle === "HAMSTRINGS");
    expect(glutesIdx).toBeLessThan(hamIdx); // equal volume: alphabetical
  });
  it("uses the goal band and reports above", () => {
    const many = Array.from({ length: 12 }, () => makeSet({ exerciseId: squat.id, localDate: "2026-10-06" }));
    const vol = weeklyMuscleVolume({ sets: many, exercises, weekStart, goal: "STRENGTH" });
    expect(vol.find((v) => v.muscle === "QUADRICEPS")).toMatchObject({ status: "above", band: { low: 4, high: 10 } });
  });
  it("counts a muscle listed as both primary and secondary once, as primary", () => {
    const odd = { ...squat, muscles: [{ muscle: "QUADRICEPS" as const, role: "SECONDARY" as const }, { muscle: "QUADRICEPS" as const, role: "PRIMARY" as const }] };
    const vol = weeklyMuscleVolume({ sets: [makeSet({ exerciseId: squat.id, localDate: "2026-10-06" })], exercises: [odd], weekStart, goal: null });
    expect(vol).toHaveLength(1);
    expect(vol[0]).toMatchObject({ fractionalSets: 1, directSets: 1 });
  });
  it("returns nothing for an empty week", () => {
    expect(weeklyMuscleVolume({ sets: [], exercises, weekStart, goal: null })).toEqual([]);
  });
});
