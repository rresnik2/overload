// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { buildAccountExport, loadAccountExportSource } from "./export";
import { isOnboarded } from "./guard";
import { completeOnboarding } from "./onboarding";
import { getProfileRow, updateProfile } from "./profile";
import { loadProfileRowCached } from "./row";

const suffix = newId().slice(-12);
const userA = `pf-a-${suffix}`;
const userB = `pf-b-${suffix}`;
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);

const payload = {
  sex: "MALE",
  birthDate: "1990-05-05",
  heightCm: 180,
  unitPreference: "KG",
  experience: "INTERMEDIATE",
  goal: "HYPERTROPHY",
  timezone: "Pacific/Auckland",
  weightKg: 81.25,
  bodyFatPct: 15.5,
} as const;

beforeAll(async () => {
  for (const id of [userA, userB]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("onboarding + profile (real Postgres)", () => {
  it("is not onboarded until the wizard completes", async () => {
    expect(await isOnboarded(ctxA)).toBe(false);
  });

  it("writes the Profile and the first BodyMetric with sync metadata in one go", async () => {
    const now = new Date("2026-10-14T23:30:00.000Z"); // already the 15th in Auckland
    expect(await completeOnboarding(ctxA, payload, now)).toEqual({ ok: true });

    const profile = await getProfileRow(ctxA);
    expect(profile).toMatchObject({ sex: "MALE", birthDate: "1990-05-05", heightCm: 180, timezone: "Pacific/Auckland", onboardedAt: now.toISOString() });
    expect(await isOnboarded(ctxA)).toBe(true);

    const metrics = await prisma.bodyMetric.findMany({ where: { userId: userA } });
    expect(metrics).toHaveLength(1);
    const metric = metrics[0]!;
    expect(metric.weightKg?.toNumber()).toBe(81.25);
    expect(metric.bodyFatPct?.toNumber()).toBe(15.5);
    expect(metric.localDate.toISOString().slice(0, 10)).toBe("2026-10-15"); // the chosen timezone's local date
    expect(metric.hlc).toMatch(/-server$/);
    expect(metric.version).toBe(1);
    expect(Object.keys(metric.fieldHlc as object)).toEqual(expect.arrayContaining(["weightKg", "bodyFatPct", "localDate", "measuredAt"]));
    expect((await prisma.syncState.findUnique({ where: { userId: userA } }))?.version).toBe(1);
  });

  it("is idempotent: a second submit adds no second metric and bumps no version", async () => {
    expect(await completeOnboarding(ctxA, { ...payload, weightKg: 70 })).toEqual({ ok: true });
    expect(await prisma.bodyMetric.count({ where: { userId: userA } })).toBe(1);
    expect((await prisma.syncState.findUnique({ where: { userId: userA } }))?.version).toBe(1);
  });

  it("rejects an invalid or userId-carrying payload without writing", async () => {
    expect((await completeOnboarding(ctxB, { ...payload, userId: userA })).ok).toBe(false);
    expect((await completeOnboarding(ctxB, { ...payload, timezone: "Nope/Nope" })).ok).toBe(false);
    expect(await prisma.profile.findUnique({ where: { userId: userB } })).toBeNull();
    expect(await prisma.bodyMetric.count({ where: { userId: userB } })).toBe(0);
  });

  it("updateProfile only ever writes the caller's row", async () => {
    expect((await updateProfile(ctxB, { defaultRestSec: 45, userId: userA })).ok).toBe(false);
    expect((await getProfileRow(ctxA))?.defaultRestSec).toBe(120);

    const result = await updateProfile(ctxB, { defaultRestSec: 45, unitPreference: "LB", insightsEnabled: false });
    expect(result.ok).toBe(true);
    expect(await getProfileRow(ctxB)).toMatchObject({ defaultRestSec: 45, unitPreference: "LB", insightsEnabled: false });
    expect(await getProfileRow(ctxA)).toMatchObject({ defaultRestSec: 120, unitPreference: "KG", insightsEnabled: true });
  });

  it("the per-request profile loader returns the caller's row, and nothing for a user without one", async () => {
    const mine = await loadProfileRowCached(ctxA);
    expect(mine?.userId).toBe(userA);
    expect(mine?.onboardedAt).not.toBeNull();
    expect((await loadProfileRowCached(ctxB))?.userId).toBe(userB);
    expect(await loadProfileRowCached(mintUserCtx(`pf-none-${suffix}`))).toBeNull();
  });

  it("exports the caller's data only, without userId or Decimals", async () => {
    const exported = buildAccountExport(await loadAccountExportSource(ctxA));
    expect(exported.bodyMetrics).toHaveLength(1);
    expect(exported.bodyMetrics[0]?.weightKg).toBe(81.25);
    expect(exported.account.email).toBe(`${userA}@example.test`);
    expect(JSON.stringify(exported)).not.toMatch(/userId|pf-b-/);

    const other = buildAccountExport(await loadAccountExportSource(ctxB));
    expect(other.bodyMetrics).toHaveLength(0);
  });

  it("deleting the user cascades the profile, metrics and sync state", async () => {
    await prisma.user.delete({ where: { id: userA } });
    expect(await prisma.profile.findUnique({ where: { userId: userA } })).toBeNull();
    expect(await prisma.bodyMetric.count({ where: { userId: userA } })).toBe(0);
    expect(await prisma.syncState.findUnique({ where: { userId: userA } })).toBeNull();
  });
});
