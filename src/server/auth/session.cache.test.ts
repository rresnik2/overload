import { beforeEach, describe, expect, it, vi } from "vitest";

// React's `cache()` is a pass-through outside a server render. Stand in a per-"request" memo so the sharing can be asserted:
// resetModules() between tests plays the part of a new request.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
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
vi.mock("./auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "x=1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const signedIn = { user: { id: "user-1", name: "Ada", email: "ada@example.com", emailVerified: true, image: null }, session: {} };

beforeEach(() => {
  vi.resetModules();
  getSession.mockReset();
  getSession.mockResolvedValue(signedIn);
});

describe("one session lookup per request", () => {
  it("the layout, the page and a guard share a single auth.api.getSession call", async () => {
    const { getSessionInfo, requireSessionInfo, requireUser } = await import("./session");
    const [a, b, c] = await Promise.all([requireSessionInfo(), requireUser(), getSessionInfo()]);
    expect(a.ctx.id).toBe("user-1");
    expect(b.id).toBe("user-1");
    expect(c?.user.name).toBe("Ada");
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("a signed-out request is shared too, and still redirects", async () => {
    getSession.mockResolvedValue(null);
    const { requireUser, getUserCtx } = await import("./session");
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(await getUserCtx()).toBeNull();
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("route handlers pass their own headers and are never served another caller's session", async () => {
    const { getUserCtx } = await import("./session");
    await getUserCtx(new Headers({ cookie: "a=1" }));
    await getUserCtx(new Headers({ cookie: "b=2" }));
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it("a new request looks the session up again", async () => {
    const first = await import("./session");
    await first.getSessionInfo();
    vi.resetModules();
    const second = await import("./session");
    await second.getSessionInfo();
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
