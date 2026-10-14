import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("./auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "x=1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { mintUserCtx, type UserCtx } from "./ctx";
import { UnauthorizedError, getUserCtx, requireSessionInfo, requireUser, withUser, withUserRoute } from "./session";

const signedIn = { user: { id: "user-1", name: "Ada", email: "ada@example.com", emailVerified: true, image: null }, session: {} };

beforeEach(() => getSession.mockReset());

describe("session boundary", () => {
  it("requireUser returns a ctx for a signed-in user", async () => {
    getSession.mockResolvedValue(signedIn);
    const ctx = await requireUser();
    expect(ctx.id).toBe("user-1");
  });

  it("requireUser redirects signed-out users to /sign-in", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    await expect(requireSessionInfo()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
  });

  it("requireSessionInfo exposes the user's display fields", async () => {
    getSession.mockResolvedValue(signedIn);
    const info = await requireSessionInfo();
    expect(info.user).toEqual({ id: "user-1", name: "Ada", email: "ada@example.com", emailVerified: true, image: null });
    expect(info.ctx.id).toBe("user-1");
  });

  it("getUserCtx never redirects", async () => {
    getSession.mockResolvedValue(null);
    expect(await getUserCtx()).toBeNull();
  });

  it("withUser passes the ctx first and throws UnauthorizedError when signed out", async () => {
    const fn = withUser(async (ctx: UserCtx, a: number, b: number) => `${ctx.id}:${a + b}`);
    getSession.mockResolvedValue(signedIn);
    expect(await fn(1, 2)).toBe("user-1:3");
    getSession.mockResolvedValue(null);
    await expect(fn(1, 2)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("withUserRoute answers 401 without running the handler when signed out", async () => {
    const handler = vi.fn(async (ctx: UserCtx) => Response.json({ id: ctx.id }));
    const route = withUserRoute(handler);
    getSession.mockResolvedValue(null);
    const denied = await route(new Request("http://localhost/api/x"), undefined);
    expect(denied.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    getSession.mockResolvedValue(signedIn);
    const ok = await route(new Request("http://localhost/api/x"), undefined);
    expect(await ok.json()).toEqual({ id: "user-1" });
  });

  it("a plain object is not a UserCtx (branded type) and mintUserCtx rejects empty ids", () => {
    // @ts-expect-error a bare { id } must not satisfy UserCtx
    const forged: UserCtx = { id: "someone-else" };
    expect(forged.id).toBe("someone-else");
    expect(() => mintUserCtx("")).toThrow();
    expect(Object.isFrozen(mintUserCtx("u"))).toBe(true);
  });
});
