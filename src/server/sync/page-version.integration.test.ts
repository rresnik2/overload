// Needs a migrated database (DATABASE_URL in .env.local). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { pageSyncVersion } from "./page-version";
import { FakeDevice } from "./test-helpers";

const suffix = newId().slice(-12);
const userId = `pagever-${suffix}`;
const ctx = mintUserCtx(userId);

beforeAll(async () => {
  await prisma.user.create({ data: { id: userId, name: userId, email: `${userId}@example.test` } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("pageSyncVersion", () => {
  it("is 0 for a user who has never synced, and follows SyncState.version (the cursor a sync reaches) after that", async () => {
    expect(await pageSyncVersion(ctx)).toBe(0);

    const dev = new FakeDevice(ctx, "devPageVersion");
    const first = await dev.push([dev.mutation("template", newId(), { name: "A", position: "a0" })], 0);
    expect(await pageSyncVersion(ctx)).toBe(first.cursor);

    const second = await dev.push([dev.mutation("template", newId(), { name: "B", position: "a1" })]);
    expect(second.cursor).toBeGreaterThan(first.cursor);
    expect(await pageSyncVersion(ctx)).toBe(second.cursor);
    expect((await prisma.syncState.findUniqueOrThrow({ where: { userId } })).version).toBe(second.cursor);
  });
});
