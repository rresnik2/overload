import { beforeEach, describe, expect, it, vi } from "vitest";
import { exampleSyncRequest } from "@/contracts/fixtures";
import { mintUserCtx } from "@/server/auth/ctx";

const applySyncSlots = vi.fn(async () => ({ results: [], changes: {}, newPrs: [], cursor: 0, hasMore: false, reset: false, serverTime: "", serverHlc: "" }));
vi.mock("@/server/sync/apply", () => ({ applySyncSlots: (...args: unknown[]) => (applySyncSlots as (...a: unknown[]) => unknown)(...args) }));
// withUserRoute without Better Auth: signed-in as "user-1" unless the test flips `signedIn`.
let signedIn = true;
vi.mock("@/server/auth/session", () => ({
  withUserRoute:
    (handler: (ctx: unknown, request: Request, routeCtx: unknown) => Promise<Response>) =>
    async (request: Request, routeCtx: unknown) =>
      signedIn ? handler(mintUserCtx("user-1"), request, routeCtx) : Response.json({ error: "unauthorized" }, { status: 401 }),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/sync", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }), undefined);

beforeEach(() => {
  signedIn = true;
  applySyncSlots.mockClear();
});

describe("POST /api/sync", () => {
  it("is 401 when signed out and never reaches the apply code", async () => {
    signedIn = false;
    expect((await post(exampleSyncRequest)).status).toBe(401);
    expect(applySyncSlots).not.toHaveBeenCalled();
  });

  it("is 400 for a body that is not JSON or has a bad envelope", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post({ ...exampleSyncRequest, cursor: "zero" })).status).toBe(400);
    expect((await post({ ...exampleSyncRequest, userId: "someone-else" })).status).toBe(400);
    expect(applySyncSlots).not.toHaveBeenCalled();
  });

  it("applies a valid request as the session user (the body never names one)", async () => {
    const res = await post(exampleSyncRequest);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(applySyncSlots).toHaveBeenCalledTimes(1);
    const [ctx, envelope, slots] = applySyncSlots.mock.calls[0] as unknown as [{ id: string }, { cursor: number }, unknown[]];
    expect(ctx.id).toBe("user-1");
    expect(envelope.cursor).toBe(exampleSyncRequest.cursor);
    expect(slots).toHaveLength(exampleSyncRequest.mutations.length);
  });

  it("passes a request with one poisoned mutation through, marked invalid, instead of failing the batch", async () => {
    const poisoned = { ...exampleSyncRequest.mutations[0], fields: { userId: "x" }, fieldHlc: { userId: "x" } };
    const res = await post({ ...exampleSyncRequest, mutations: [poisoned, ...exampleSyncRequest.mutations] });
    expect(res.status).toBe(200);
    const slots = (applySyncSlots.mock.calls[0] as unknown as [unknown, unknown, { kind: string }[]])[2];
    expect(slots[0]?.kind).toBe("invalid");
    expect(slots.slice(1).every((s) => s.kind === "ok")).toBe(true);
  });
});
