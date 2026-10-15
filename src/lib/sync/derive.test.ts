import { describe, expect, it } from "vitest";
import { deriveSetColumns, type DeriveSetInput } from "./derive";

const base: DeriveSetInput = {
  set: { weightKg: 100, reps: 5, rir: 0 },
  workoutExercise: { workoutId: "w1", exerciseId: "e1", machineProfileId: null },
  workout: { localDate: "2026-10-12", bodyweightKg: null },
  exercise: { loadType: "TOTAL", isUnilateral: false, bodyweightFactor: null },
  machineProfile: null,
  fallbackBodyweightKg: null,
};

describe("deriveSetColumns", () => {
  it("derives the denormalized keys, the series key and the loads", () => {
    expect(deriveSetColumns(base)).toEqual({
      workoutId: "w1",
      exerciseId: "e1",
      machineProfileId: null,
      seriesKey: "e1",
      localDate: "2026-10-12",
      effectiveLoadKg: 100,
      e1rmKg: 116.667,
    });
  });

  it("keys machine series separately and adds the machine's base load for plates per side", () => {
    const d = deriveSetColumns({
      ...base,
      workoutExercise: { workoutId: "w1", exerciseId: "e1", machineProfileId: "m1" },
      exercise: { loadType: "PLATES_PER_SIDE", isUnilateral: false, bodyweightFactor: null },
      machineProfile: { baseLoadKg: 50 },
    });
    expect(d.seriesKey).toBe("e1:m1");
    expect(d.effectiveLoadKg).toBe(250);
  });

  it("uses the workout bodyweight, then the latest body metric, for BODYWEIGHT_PLUS", () => {
    const bw = { ...base, set: { weightKg: 10, reps: 5, rir: null }, exercise: { loadType: "BODYWEIGHT_PLUS" as const, isUnilateral: false, bodyweightFactor: 1 } };
    expect(deriveSetColumns({ ...bw, workout: { localDate: "d", bodyweightKg: 80 }, fallbackBodyweightKg: 70 }).effectiveLoadKg).toBe(90);
    expect(deriveSetColumns({ ...bw, fallbackBodyweightKg: 70 }).effectiveLoadKg).toBe(80);
    const unknown = deriveSetColumns(bw);
    expect(unknown.effectiveLoadKg).toBeNull();
    expect(unknown.e1rmKg).toBeNull();
  });

  it("has no e1RM without reps or when too many reps", () => {
    expect(deriveSetColumns({ ...base, set: { weightKg: 100, reps: null, rir: null } }).e1rmKg).toBeNull();
    expect(deriveSetColumns({ ...base, set: { weightKg: 100, reps: 20, rir: null } }).e1rmKg).toBeNull();
  });
});
