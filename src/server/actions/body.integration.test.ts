// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { addBodyMetric, deleteBodyMetric, editBodyMetric } from "./body.logic";

const suffix = newId().slice(-12);
const userA = `bm-a-${suffix}`;
const userB = `bm-b-${suffix}`;
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);
const NOW = new Date("2026-10-14T15:00:00Z");

beforeAll(async () => {
  for (const id of [userA, userB]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  await prisma.profile.create({ data: { userId: userA, sex: "MALE", heightCm: 180, timezone: "UTC", unitPreference: "KG", effortScale: "RIR", e1rmFormula: "EPLEY", defaultRestSec: 120 } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("body metric actions (real Postgres)", () => {
  let id = "";

  it("adds a row with sync metadata and bumps the per-user version", async () => {
    const result = await addBodyMetric(ctxA, { localDate: "2026-10-14", weightKg: 81.2 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    id = result.data.id;
    const row = await prisma.bodyMetric.findUniqueOrThrow({ where: { id } });
    expect(row.userId).toBe(userA);
    expect(row.version).toBeGreaterThan(0);
    expect(row.hlc).not.toBe("");
    expect(row.measuredAt.toISOString()).toBe(NOW.toISOString());
    expect((await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } })).version).toBeGreaterThanOrEqual(row.version);
  });

  it("rejects an injected userId and an empty measurement without writing", async () => {
    const before = await prisma.bodyMetric.count();
    expect((await addBodyMetric(ctxA, { localDate: "2026-10-14", weightKg: 80, userId: userB }, NOW)).ok).toBe(false);
    const empty = await addBodyMetric(ctxA, { localDate: "2026-10-14" }, NOW);
    expect(empty).toMatchObject({ ok: false, fieldErrors: { _: expect.any(String) } });
    expect(await prisma.bodyMetric.count()).toBe(before);
  });

  it("recomputes a Navy body fat on the server (the client cannot choose the number)", async () => {
    const result = await addBodyMetric(ctxA, { localDate: "2026-10-13", neckCm: 39, waistCm: 84, bodyFatPct: 5, bodyFatMethod: "NAVY_TAPE" }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = await prisma.bodyMetric.findUniqueOrThrow({ where: { id: result.data.id } });
    expect(Number(row.bodyFatPct)).toBeGreaterThan(8);
    expect(row.bodyFatMethod).toBe("NAVY_TAPE");
    expect(row.measuredAt.toISOString()).toBe("2026-10-13T12:00:00.000Z");
  });

  it("the tape method needs sex and height", async () => {
    const result = await addBodyMetric(ctxB, { localDate: "2026-10-14", neckCm: 39, waistCm: 84, bodyFatMethod: "NAVY_TAPE" }, NOW);
    expect(result).toMatchObject({ ok: false, fieldErrors: { bodyFatMethod: expect.any(String) } });
  });

  it("edits and deletes only the caller's rows", async () => {
    expect((await editBodyMetric(ctxB, { id, fields: { localDate: "2026-10-14", weightKg: 1 + 80 } }, NOW)).ok).toBe(false);
    expect((await deleteBodyMetric(ctxB, { id }, NOW)).ok).toBe(false);
    expect(Number((await prisma.bodyMetric.findUniqueOrThrow({ where: { id } })).weightKg)).toBe(81.2);

    const later = new Date(NOW.getTime() + 60_000);
    expect((await editBodyMetric(ctxA, { id, fields: { localDate: "2026-10-14", weightKg: 80.4 } }, later)).ok).toBe(true);
    expect(Number((await prisma.bodyMetric.findUniqueOrThrow({ where: { id } })).weightKg)).toBe(80.4);

    expect((await deleteBodyMetric(ctxA, { id }, new Date(later.getTime() + 60_000))).ok).toBe(true);
    expect((await prisma.bodyMetric.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect((await deleteBodyMetric(ctxA, { id }, later)).ok).toBe(false); // already gone
  });
});
