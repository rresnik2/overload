import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { WorkoutSet, Profile } from "@/generated/prisma/client";
import { profileRowToFact, setRowToFact, type SetRowWithWorkout } from "./facts";

const D = (v: string) => new Prisma.Decimal(v);
const when = new Date("2026-10-12T17:20:00.000Z");

function setRow(overrides: Partial<WorkoutSet> = {}): SetRowWithWorkout {
  return {
    id: "set-1", userId: "u", workoutExerciseId: "we-1", workoutId: "w-1", exerciseId: "ex-1", machineProfileId: "mp-1",
    seriesKey: "ex-1:mp-1", localDate: new Date("2026-10-12T00:00:00.000Z"), effectiveLoadKg: D("230"), e1rmKg: D("268.333"),
    position: "a0", setType: "WORKING", weightKg: D("90"), inputUnit: "LB", reps: 5, rir: D("2.0"), durationSec: null, distanceM: null,
    completedAt: when, notes: null, hlc: "", fieldHlc: {}, version: 3, deletedAt: null, createdAt: when, updatedAt: when,
    workout: { isDeload: false, bodyweightKg: D("82.40") },
    ...overrides,
  };
}

describe("loadSetFacts mapping", () => {
  it("maps a completed machine set to a SetFact (numbers, ISO instants, series key kept)", () => {
    expect(setRowToFact(setRow())).toEqual({
      id: "set-1", workoutId: "w-1", exerciseId: "ex-1", machineProfileId: "mp-1", seriesKey: "ex-1:mp-1",
      localDate: "2026-10-12", completedAt: "2026-10-12T17:20:00.000Z", setType: "WORKING", weightKg: 90, effectiveLoadKg: 230,
      reps: 5, rir: 2, durationSec: null, distanceM: null, e1rmKg: 268.333, isDeload: false, workoutBodyweightKg: 82.4,
    });
  });

  it("refuses planned sets (they must be filtered out by the query)", () => {
    expect(() => setRowToFact(setRow({ completedAt: null }))).toThrow(/planned/);
  });

  it("carries the deload flag from the workout", () => {
    expect(setRowToFact(setRow({ workout: { isDeload: true, bodyweightKg: null } } as Partial<WorkoutSet>)).isDeload).toBe(true);
  });
});

describe("profileRowToFact", () => {
  it("defaults when there is no profile row yet", () => {
    expect(profileRowToFact(null, "2026-10-14")).toEqual({
      sex: null, birthDate: null, ageYears: null, heightCm: null, experience: null, goal: null,
      e1rmFormula: "EPLEY", unitPreference: "KG", timezone: "UTC",
    });
  });

  it("derives age from the birth date and the supplied local date", () => {
    const row: Profile = {
      userId: "u", sex: "FEMALE", birthDate: new Date("1990-10-15T00:00:00.000Z"), heightCm: D("168.5"), unitPreference: "LB",
      effortScale: "RPE", experience: "BEGINNER", goal: "STRENGTH", e1rmFormula: "BRZYCKI", timezone: "Europe/Berlin",
      defaultRestSec: 90, insightsEnabled: true, onboardedAt: when, createdAt: when, updatedAt: when,
    };
    const fact = profileRowToFact(row, "2026-10-14");
    expect(fact).toMatchObject({ ageYears: 35, heightCm: 168.5, e1rmFormula: "BRZYCKI", timezone: "Europe/Berlin", goal: "STRENGTH" });
  });
});
