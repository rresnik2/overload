import { describe, expect, it } from "vitest";
import { effortOptions, formatClock, loadLabel, setFields } from "./labels";

describe("loadLabel: what the logged number means", () => {
  const base = { equipment: "DUMBBELL", isUnilateral: false } as const;
  it("labels every LoadType", () => {
    expect(loadLabel({ ...base, loadType: "PER_IMPLEMENT" }).short).toBe("per hand");
    expect(loadLabel({ ...base, loadType: "PLATES_PER_SIDE" }).short).toBe("per side");
    expect(loadLabel({ ...base, loadType: "STACK" }).short).toBe("stack");
    expect(loadLabel({ ...base, loadType: "BODYWEIGHT_PLUS" }).short).toBe("+ bodyweight");
    expect(loadLabel({ ...base, loadType: "TOTAL" }).short).toBe("total");
    expect(loadLabel({ ...base, loadType: "NONE" }).short).toBe("");
  });
});

describe("setFields: inputs per TrackingType", () => {
  it("follows tracking and drops the weight for LoadType NONE", () => {
    expect(setFields({ tracking: "LOAD_REPS", loadType: "TOTAL" })).toEqual({ weight: true, reps: true, duration: false, distance: false });
    expect(setFields({ tracking: "LOAD_REPS", loadType: "NONE" })).toMatchObject({ weight: false, reps: true });
    expect(setFields({ tracking: "REPS", loadType: "NONE" })).toMatchObject({ weight: false, reps: true });
    expect(setFields({ tracking: "DURATION", loadType: "NONE" })).toMatchObject({ reps: false, duration: true, distance: false });
    expect(setFields({ tracking: "DISTANCE_DURATION", loadType: "NONE" })).toMatchObject({ duration: true, distance: true });
  });
});

describe("effortOptions", () => {
  it("shows RIR directly and RPE as 10 - RIR, both mapping to the stored RIR", () => {
    expect(effortOptions("RIR").map((o) => o.label)).toEqual(["0", "1", "2", "3", "4+"]);
    expect(effortOptions("RPE").map((o) => o.label)).toEqual(["10", "9", "8", "7", "6"]);
    expect(effortOptions("RPE").map((o) => o.rir)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("formatClock", () => {
  it("formats mm:ss and h:mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(-5)).toBe("0:00");
  });
});
