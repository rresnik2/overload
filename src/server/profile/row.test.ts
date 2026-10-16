import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("react", () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const memo = new Map<string, R>();
    return (...args: A): R => {
      const key = JSON.stringify(args);
      if (!memo.has(key)) memo.set(key, fn(...args));
      return memo.get(key) as R;
    };
  },
}));
vi.mock("@/server/db", () => ({ prisma: { profile: { findUnique } } }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { mintUserCtx } from "@/server/auth/ctx";

beforeEach(() => {
  vi.resetModules();
  findUnique.mockReset();
  findUnique.mockResolvedValue({ userId: "user-1", onboardedAt: new Date("2026-01-01"), timezone: "Europe/Oslo" });
});

describe("the per-request profile row", () => {
  it("is read once for the guard, the unit lookup and the timezone lookup of one render", async () => {
    const ctx = mintUserCtx("user-1");
    const { redirectIfNotOnboarded } = await import("./guard");
    const { loadProfileRowCached } = await import("./row");
    await Promise.all([redirectIfNotOnboarded(ctx), loadProfileRowCached(ctx), loadProfileRowCached(ctx), redirectIfNotOnboarded(ctx)]);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("never serves one user's row to another", async () => {
    const { loadProfileRowCached } = await import("./row");
    await loadProfileRowCached(mintUserCtx("user-1"));
    await loadProfileRowCached(mintUserCtx("user-2"));
    expect(findUnique.mock.calls.map((c) => (c[0] as { where: { userId: string } }).where.userId)).toEqual(["user-1", "user-2"]);
  });

  it("the guard still redirects an un-onboarded user", async () => {
    findUnique.mockResolvedValue({ userId: "user-1", onboardedAt: null });
    const { redirectIfNotOnboarded } = await import("./guard");
    await expect(redirectIfNotOnboarded(mintUserCtx("user-1"))).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  });
});
