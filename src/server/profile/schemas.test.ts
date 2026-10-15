import { describe, expect, it } from "vitest";
import { deleteAccountSchema, onboardingSchema, profileFormSchema } from "./schemas";

const valid = {
  sex: "FEMALE",
  birthDate: "1993-02-11",
  heightCm: 168,
  unitPreference: "LB",
  experience: "BEGINNER",
  goal: "STRENGTH",
  timezone: "Europe/Paris",
  weightKg: 64.5,
  bodyFatPct: null,
} as const;

describe("onboardingSchema", () => {
  it("accepts a complete payload and defaults body fat to null", () => {
    const { bodyFatPct: _omit, ...rest } = valid;
    expect(onboardingSchema.parse(rest).bodyFatPct).toBeNull();
    expect(onboardingSchema.parse({ ...valid, bodyFatPct: 18.5 }).bodyFatPct).toBe(18.5);
  });

  it.each([
    ["userId", { userId: "u1" }],
    ["version", { version: 3 }],
    ["onboardedAt", { onboardedAt: "2026-01-01T00:00:00Z" }],
  ])("rejects an injected %s", (_name, extra) => {
    expect(onboardingSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });

  it.each([
    ["unknown sex", { sex: "OTHER" }],
    ["height out of range", { heightCm: 20 }],
    ["weight out of range", { weightKg: 5 }],
    ["body fat out of range", { bodyFatPct: 90 }],
    ["bad time zone", { timezone: "Mars/Olympus" }],
    ["malformed date", { birthDate: "11/02/1993" }],
    ["under 13", { birthDate: "2026-01-01" }],
    ["over 110", { birthDate: "1900-01-01" }],
  ])("rejects %s", (_name, patch) => {
    expect(onboardingSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("requires every non-optional field", () => {
    const { goal: _goal, ...rest } = valid;
    expect(onboardingSchema.safeParse(rest).success).toBe(false);
  });
});

describe("profileFormSchema", () => {
  it("accepts partial updates and nulls for optional fields", () => {
    expect(profileFormSchema.safeParse({ defaultRestSec: 90 }).success).toBe(true);
    expect(profileFormSchema.safeParse({ sex: null, birthDate: null, heightCm: null, experience: null, goal: null }).success).toBe(true);
  });

  it("rejects userId and other server-owned keys", () => {
    for (const extra of [{ userId: "x" }, { onboardedAt: "2026-01-01T00:00:00Z" }, { createdAt: "x" }]) {
      expect(profileFormSchema.safeParse({ defaultRestSec: 90, ...extra }).success).toBe(false);
    }
  });

  it("validates the time zone and ranges", () => {
    expect(profileFormSchema.safeParse({ timezone: "Asia/Tokyo" }).success).toBe(true);
    expect(profileFormSchema.safeParse({ timezone: "Nowhere/Land" }).success).toBe(false);
    expect(profileFormSchema.safeParse({ defaultRestSec: 99999 }).success).toBe(false);
    expect(profileFormSchema.safeParse({ defaultRestSec: 1.5 }).success).toBe(false);
  });
});

describe("deleteAccountSchema", () => {
  it("matches the phrase case-insensitively and trims", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "  Delete My Account " }).success).toBe(true);
  });
  it("rejects anything else and unknown keys", () => {
    expect(deleteAccountSchema.safeParse({ confirmation: "delete" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ confirmation: "delete my account", userId: "x" }).success).toBe(false);
  });
});
