import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/server/db", () => ({ prisma: { profile: { findUnique } } }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { mintUserCtx } from "@/server/auth/ctx";
import { isOnboarded, redirectIfNotOnboarded } from "./guard";

const ctx = mintUserCtx("user-1");
beforeEach(() => findUnique.mockReset());

describe("redirectIfNotOnboarded", () => {
  it("redirects when there is no profile row", async () => {
    findUnique.mockResolvedValue(null);
    await expect(redirectIfNotOnboarded(ctx)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  });

  it("redirects when onboardedAt is null", async () => {
    findUnique.mockResolvedValue({ onboardedAt: null });
    await expect(redirectIfNotOnboarded(ctx)).rejects.toThrow("NEXT_REDIRECT:/onboarding");
  });

  it("does nothing once onboarded, and only reads the caller's row", async () => {
    findUnique.mockResolvedValue({ onboardedAt: new Date() });
    await expect(redirectIfNotOnboarded(ctx)).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    await expect(isOnboarded(ctx)).resolves.toBe(true);
  });
});
