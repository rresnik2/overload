import { beforeAll, describe, expect, it, vi } from "vitest";

const collectTombstones = vi.fn(async () => ({ users: 0, deleted: {}, cutoff: "" }));
vi.mock("@/server/sync/gc", () => ({ collectTombstones: () => collectTombstones() }));

const SECRET = "test-cron-secret-0123456789";
let GET: (request: Request) => Promise<Response>;

beforeAll(async () => {
  vi.stubEnv("CRON_SECRET", SECRET); // a throwaway value for this test process only
  ({ GET } = await import("./route"));
});

const call = (authorization?: string) =>
  GET(new Request("http://localhost/api/sync/gc", { headers: authorization ? { authorization } : {} }));

describe("GET /api/sync/gc", () => {
  it("requires the cron bearer secret", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(`Bearer ${SECRET}x`)).status).toBe(401);
    expect(collectTombstones).not.toHaveBeenCalled();
  });

  it("runs garbage collection when the secret matches", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(collectTombstones).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ users: 0 });
  });
});
