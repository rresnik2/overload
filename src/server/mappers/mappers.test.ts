import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { Exercise, ExerciseMuscle, MachineProfile, Workout, WorkoutSet, BodyMetric, PersonalRecord, Profile } from "@/generated/prisma/client";
import { FIXTURE_HLC, FIXTURE_IDS, exampleCatalogExerciseRow, exampleWorkoutSetRow } from "@/contracts/fixtures";
import {
  bodyMetricToRow,
  exerciseToRow,
  machineProfileToRow,
  num,
  personalRecordToRow,
  profileToRow,
  workoutSetToRow,
  workoutToRow,
} from "./index";

const D = (v: string) => new Prisma.Decimal(v);
const when = new Date("2026-10-12T17:00:00.000Z");
const sync = { hlc: FIXTURE_HLC, fieldHlc: { reps: FIXTURE_HLC, junk: 5 } as Prisma.JsonValue, version: 12, deletedAt: null, createdAt: when, updatedAt: when };

/** Deep-check: nothing Decimal-like or Date-like, no userId. The mapper output must be plain JSON-able data. */
function assertPlain(value: unknown, path = "row"): void {
  if (value === null || typeof value !== "object") return;
  expect(value instanceof Date, `${path} is a Date`).toBe(false);
  expect(typeof (value as { toNumber?: unknown }).toNumber, `${path} is a Decimal`).not.toBe("function");
  for (const [k, v] of Object.entries(value)) {
    expect(k, `${path}.${k}`).not.toBe("userId");
    assertPlain(v, `${path}.${k}`);
  }
}

describe("mappers", () => {
  it("num converts Decimal and passes null through", () => {
    expect(num(D("61.235"))).toBe(61.235);
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });

  it("maps a WorkoutSet (Decimal -> number, Date -> ISO, @db.Date -> YYYY-MM-DD, no userId)", () => {
    const row: WorkoutSet = {
      id: FIXTURE_IDS.workoutSet,
      userId: "user-1",
      workoutExerciseId: FIXTURE_IDS.workoutExercise,
      workoutId: FIXTURE_IDS.workout,
      exerciseId: FIXTURE_IDS.exerciseSquat,
      machineProfileId: null,
      seriesKey: FIXTURE_IDS.exerciseSquat,
      localDate: new Date("2026-10-12T00:00:00.000Z"),
      effectiveLoadKg: D("140"),
      e1rmKg: D("163.333"),
      position: "a0",
      setType: "WORKING",
      weightKg: D("140"),
      inputUnit: "KG",
      reps: 5,
      rir: D("2.0"),
      durationSec: null,
      distanceM: null,
      completedAt: new Date("2026-10-12T17:20:00.000Z"),
      notes: null,
      ...sync,
    };
    const mapped = workoutSetToRow(row);
    assertPlain(mapped);
    expect(mapped.fieldHlc).toEqual({ reps: FIXTURE_HLC }); // non-string entries are dropped
    expect({ ...mapped, fieldHlc: exampleWorkoutSetRow.fieldHlc, hlc: exampleWorkoutSetRow.hlc }).toEqual({
      ...exampleWorkoutSetRow,
      createdAt: "2026-10-12T17:00:00.000Z",
      updatedAt: "2026-10-12T17:00:00.000Z",
    });
  });

  it("maps a catalog Exercise with muscles", () => {
    const row: Exercise & { muscles: ExerciseMuscle[] } = {
      id: FIXTURE_IDS.exerciseSquat,
      userId: null,
      sourceId: "Barbell_Squat",
      slug: "barbell-squat",
      name: "Barbell Squat",
      aliases: ["Back Squat"],
      modality: "FREE_WEIGHT",
      equipment: "BARBELL",
      loadType: "TOTAL",
      tracking: "LOAD_REPS",
      bodyweightFactor: null,
      isUnilateral: false,
      mechanic: "COMPOUND",
      force: "PUSH",
      level: "INTERMEDIATE",
      category: "POWERLIFTING",
      standardLift: "SQUAT",
      instructions: exampleCatalogExerciseRow.instructions,
      images: exampleCatalogExerciseRow.images,
      hlc: "",
      fieldHlc: {},
      version: 0,
      deletedAt: null,
      createdAt: when,
      updatedAt: when,
      muscles: [
        { exerciseId: FIXTURE_IDS.exerciseSquat, muscle: "QUADRICEPS", role: "PRIMARY" },
        { exerciseId: FIXTURE_IDS.exerciseSquat, muscle: "GLUTES", role: "SECONDARY" },
      ],
    };
    const mapped = exerciseToRow(row);
    assertPlain(mapped);
    expect(mapped).toEqual({ ...exampleCatalogExerciseRow, createdAt: "2026-10-12T17:00:00.000Z", updatedAt: "2026-10-12T17:00:00.000Z" });
    expect(exerciseToRow({ ...row, userId: "user-1" }).isCustom).toBe(true);
  });

  it("maps machine profile, body metric, workout, PR and profile without leaking Decimals", () => {
    const machine: MachineProfile = {
      id: FIXTURE_IDS.machineProfile, userId: "u", name: "Leg press", gymName: null, brand: null, exerciseId: null,
      labelUnit: "LB", pinStepKg: D("2.268"), baseLoadKg: D("50.00"), notes: null, ...sync,
    };
    expect(machineProfileToRow(machine)).toMatchObject({ pinStepKg: 2.268, baseLoadKg: 50 });

    const body: BodyMetric = {
      id: FIXTURE_IDS.bodyMetric, userId: "u", measuredAt: when, localDate: new Date("2026-10-12T00:00:00.000Z"),
      weightKg: D("82.40"), bodyFatPct: D("16.5"), bodyFatMethod: "DEXA", neckCm: null, waistCm: D("86.0"), hipCm: null,
      chestCm: null, armCm: null, thighCm: null, calfCm: null, notes: null, ...sync,
    };
    const bodyRow = bodyMetricToRow(body);
    assertPlain(bodyRow);
    expect(bodyRow).toMatchObject({ weightKg: 82.4, bodyFatPct: 16.5, waistCm: 86, localDate: "2026-10-12" });

    const workout: Workout = {
      id: FIXTURE_IDS.workout, userId: "u", templateId: null, title: null, startedAt: when, endedAt: null,
      localDate: new Date("2026-10-12T00:00:00.000Z"), timezone: "UTC", bodyweightKg: null, isDeload: true, notes: null, ...sync,
    };
    expect(workoutToRow(workout)).toMatchObject({ isDeload: true, endedAt: null, localDate: "2026-10-12" });

    const pr: PersonalRecord = {
      id: "0192a5b0-0010-7000-8000-000000000001", userId: "u", exerciseId: FIXTURE_IDS.exerciseSquat, machineProfileId: null,
      seriesKey: FIXTURE_IDS.exerciseSquat, type: "E1RM", reps: 0, value: D("163.333"), previousValue: null, setId: null,
      workoutId: FIXTURE_IDS.workout, achievedAt: when, computedAt: when,
    };
    const prRow = personalRecordToRow(pr);
    assertPlain(prRow);
    expect(prRow).toMatchObject({ value: 163.333, previousValue: null });

    const profile: Profile = {
      userId: "u", sex: "MALE", birthDate: new Date("1992-03-02T00:00:00.000Z"), heightCm: D("180.0"), unitPreference: "LB",
      effortScale: "RIR", experience: "INTERMEDIATE", goal: "HYPERTROPHY", e1rmFormula: "EPLEY", timezone: "UTC",
      defaultRestSec: 120, insightsEnabled: true, onboardedAt: null, createdAt: when, updatedAt: when,
    };
    const profileRow = profileToRow(profile);
    assertPlain(profileRow);
    expect(profileRow).toMatchObject({ heightCm: 180, birthDate: "1992-03-02", onboardedAt: null });
  });
});
