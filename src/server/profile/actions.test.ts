// Security: every profile/settings action ignores or rejects an injected userId and only touches the session user's row.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsert, findUnique, transaction, sessionUser } = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  transaction: vi.fn(),
  sessionUser: { id: "session-user" },
}));

vi.mock("@/server/db", () => ({ prisma: { profile: { upsert, findUnique }, $transaction: transaction } }));
vi.mock("@/server/auth/session", async () => {
  const { mintUserCtx } = await import("@/server/auth/ctx");
  return { withUser: <A extends unknown[], R>(fn: (ctx: ReturnType<typeof mintUserCtx>, ...a: A) => Promise<R>) => (...args: A) => fn(mintUserCtx(sessionUser.id), ...args) };
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], delete: () => {} }) }));
vi.mock("@/server/auth/auth", () => ({ auth: { api: {} } }));

import { completeOnboardingAction, deleteAccountAction, updateProfileAction } from "@/server/actions/profile";

const profileRow = {
  userId: "session-user", sex: null, birthDate: null, heightCm: null, unitPreference: "KG", effortScale: "RIR", experience: null, goal: null,
  e1rmFormula: "EPLEY", timezone: "UTC", defaultRestSec: 90, insightsEnabled: true, onboardedAt: null,
};

beforeEach(() => {
  upsert.mockReset().mockResolvedValue(profileRow);
  findUnique.mockReset();
  transaction.mockReset();
});

describe("updateProfileAction", () => {
  it("rejects an injected userId and writes nothing", async () => {
    const result = await updateProfileAction({ defaultRestSec: 90, userId: "victim" });
    expect(result.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects userId even when nested alongside valid fields of every kind", async () => {
    const result = await updateProfileAction({ timezone: "Asia/Tokyo", insightsEnabled: false, userId: "victim", id: "victim" });
    expect(result.ok).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("writes only the session user's row on a valid payload", async () => {
    const result = await updateProfileAction({ defaultRestSec: 90, timezone: "Asia/Tokyo" });
    expect(result.ok).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    const args = upsert.mock.calls[0]?.[0];
    expect(args.where).toEqual({ userId: "session-user" });
    expect(args.create.userId).toBe("session-user");
    expect(args.update).not.toHaveProperty("userId");
    expect(args.update).toEqual({ defaultRestSec: 90, timezone: "Asia/Tokyo" });
  });

  it("returns field errors for invalid values", async () => {
    const result = await updateProfileAction({ timezone: "Nope/Nope" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { timezone: expect.any(String) } });
  });
});

describe("completeOnboardingAction", () => {
  const payload = {
    sex: "MALE", birthDate: "1990-05-05", heightCm: 180, unitPreference: "KG", experience: "BEGINNER", goal: "GENERAL", timezone: "UTC", weightKg: 80, bodyFatPct: null,
  };

  it("rejects an injected userId (and other server-owned fields) without opening a transaction", async () => {
    for (const extra of [{ userId: "victim" }, { version: 9 }, { hlc: "x" }]) {
      const result = await completeOnboardingAction({ ...payload, ...extra });
      expect(result.ok).toBe(false);
    }
    expect(transaction).not.toHaveBeenCalled();
  });

  it("runs one transaction for the session user and redirects to /today", async () => {
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        profile: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn() },
        syncState: { upsert: vi.fn().mockResolvedValue({ version: 7 }) },
        bodyMetric: { create: vi.fn() },
      };
      await fn(tx);
      expect(tx.profile.upsert.mock.calls[0]?.[0].where).toEqual({ userId: "session-user" });
      const created = tx.bodyMetric.create.mock.calls[0]?.[0].data;
      expect(created).toMatchObject({ userId: "session-user", weightKg: 80, version: 7 });
      expect(created.fieldHlc).toHaveProperty("weightKg");
      expect(tx.syncState.upsert.mock.calls[0]?.[0].where).toEqual({ userId: "session-user" });
    });
    await expect(completeOnboardingAction(payload)).rejects.toThrow("NEXT_REDIRECT:/today");
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe("deleteAccountAction", () => {
  it("rejects an injected userId and an unconfirmed request before touching the database", async () => {
    expect((await deleteAccountAction({ confirmation: "delete my account", userId: "victim" })).ok).toBe(false);
    expect((await deleteAccountAction({ confirmation: "please" })).ok).toBe(false);
  });
});
