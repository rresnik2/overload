import { describe, expect, it } from "vitest";
import type { Profile } from "@/generated/prisma/client";
import { buildAccountExport, EXPORT_FORMAT_VERSION, type AccountExportSource } from "./export";

// Prisma returns Decimal objects; the mappers only call toNumber() on them.
const dec = (n: number) => ({ toNumber: () => n, toString: () => String(n), isDecimal: true });
const at = new Date("2026-10-12T17:00:00.000Z");
const day = new Date("2026-10-12T00:00:00.000Z");
const sync = { hlc: "001791990000000-00000-itest", fieldHlc: { reps: "h" }, version: 4, deletedAt: null, createdAt: at, updatedAt: at };

const source = {
  // extra secret-looking columns that a careless `select *` would leak: the export must drop them
  user: { name: "Ada", email: "ada@example.com", createdAt: at, id: "user-1", emailVerified: true },
  accounts: [
    { providerId: "credential", createdAt: at, password: "scrypt$hash", accessToken: "tok", userId: "user-1" },
    { providerId: "google", createdAt: at, refreshToken: "rt", idToken: "id", userId: "user-1" },
  ],
  passkeys: [{ name: "iPhone", deviceType: "multiDevice", createdAt: at, publicKey: "PK", credentialID: "CID", userId: "user-1" }],
  profile: {
    userId: "user-1", sex: "MALE", birthDate: day, heightCm: dec(180.5), unitPreference: "KG", effortScale: "RIR", experience: "INTERMEDIATE", goal: "STRENGTH",
    e1rmFormula: "EPLEY", timezone: "UTC", defaultRestSec: 120, insightsEnabled: true, onboardedAt: at, createdAt: at, updatedAt: at,
  },
  customExercises: [],
  machineProfiles: [{ id: "m1", userId: "user-1", name: "Leg press", gymName: null, brand: null, exerciseId: null, labelUnit: null, pinStepKg: dec(5), baseLoadKg: dec(0), platesKg: [], notes: null, ...sync }],
  exerciseFavorites: [{ id: "f1", userId: "user-1", exerciseId: "e1", position: "a0", ...sync }],
  bodyMetrics: [
    {
      id: "b1", userId: "user-1", measuredAt: at, localDate: day, weightKg: dec(82.5), bodyFatPct: dec(16), bodyFatMethod: null,
      neckCm: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, calfCm: null, notes: null, ...sync,
    },
  ],
  templates: [],
  templateExercises: [],
  workouts: [],
  workoutExercises: [],
  workoutSets: [
    {
      id: "s1", userId: "user-1", workoutExerciseId: "we1", workoutId: "w1", exerciseId: "e1", machineProfileId: null, seriesKey: "e1", localDate: day,
      effectiveLoadKg: dec(100), e1rmKg: dec(116.7), position: "a0", setType: "WORKING", weightKg: dec(100), inputUnit: "KG", reps: 5, rir: dec(2),
      durationSec: null, distanceM: null, completedAt: at, notes: null, ...sync,
    },
  ],
  personalRecords: [
    { id: "pr1", userId: "user-1", exerciseId: "e1", machineProfileId: null, seriesKey: "e1", type: "E1RM", reps: null, value: dec(116.7), previousValue: null, setId: "s1", workoutId: "w1", achievedAt: at },
  ],
  insightReports: [{ weekStart: day, status: "READY", trigger: "WEEKLY", narrative: { headline: "Good week" }, facts: { sets: 12 }, generatedAt: at }],
} as unknown as AccountExportSource;

describe("buildAccountExport", () => {
  const exported = buildAccountExport(source, new Date("2026-10-14T00:00:00.000Z"));
  const json = JSON.stringify(exported);

  it("has no Decimal objects: every numeric column is a plain number", () => {
    expect(exported.bodyMetrics[0]).toMatchObject({ weightKg: 82.5, bodyFatPct: 16, localDate: "2026-10-12" });
    expect(exported.workoutSets[0]).toMatchObject({ weightKg: 100, effectiveLoadKg: 100, e1rmKg: 116.7, rir: 2 });
    expect(exported.profile).toMatchObject({ heightCm: 180.5, birthDate: "2026-10-12" });
    expect(exported.personalRecords[0]?.value).toBe(116.7);
    expect(json).not.toContain("isDecimal");
  });

  it("never contains a userId, password hash, token or key material", () => {
    expect(json).not.toMatch(/userId/);
    for (const secret of ["scrypt$hash", "accessToken", "refreshToken", "idToken", "publicKey", "credentialID", "PK", "CID", "tok"]) {
      expect(json).not.toContain(`"${secret}"`);
    }
    expect(json).not.toContain("scrypt");
  });

  it("includes the starred exercises as plain rows", () => {
    expect(exported.exerciseFavorites).toEqual([expect.objectContaining({ id: "f1", exerciseId: "e1", position: "a0" })]);
  });

  it("describes sign-in methods by name only", () => {
    expect(exported.account).toEqual({
      name: "Ada",
      email: "ada@example.com",
      createdAt: at.toISOString(),
      signInMethods: ["google", "password"],
      passkeys: [{ name: "iPhone", deviceType: "multiDevice", createdAt: at.toISOString() }],
    });
  });

  it("carries a format version, timestamps as ISO strings and the insight narrative", () => {
    expect(exported.formatVersion).toBe(EXPORT_FORMAT_VERSION);
    expect(exported.exportedAt).toBe("2026-10-14T00:00:00.000Z");
    expect(exported.insightReports[0]).toMatchObject({ weekStart: "2026-10-12", narrative: { headline: "Good week" } });
  });

  it("handles a user with no profile row", () => {
    expect(buildAccountExport({ ...source, profile: null as Profile | null }).profile).toBeNull();
  });
});
