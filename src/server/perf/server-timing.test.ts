import { describe, expect, it } from "vitest";
import { measureQuery, serverTimingHeader, type RequestStats } from "@/server/perf/server-timing";

const fresh = (): RequestStats => ({ queries: 0, dbMs: 0, firstStart: Infinity, lastEnd: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("measureQuery", () => {
  it("counts queries and time into the given request stats, returns the result", async () => {
    const s = fresh();
    const [a, b] = await Promise.all([
      measureQuery(async () => (await sleep(20), "a"), s),
      measureQuery(async () => (await sleep(20), "b"), s),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
    expect(s.queries).toBe(2);
    expect(s.dbMs).toBeGreaterThanOrEqual(30);
    expect(s.lastEnd - s.firstStart).toBeLessThan(s.dbMs);
  });

  it("still counts a failing query and rethrows", async () => {
    const s = fresh();
    await expect(measureQuery(async () => { throw new Error("boom"); }, s)).rejects.toThrow("boom");
    expect(s.queries).toBe(1);
  });

  it("formats the header", () => {
    expect(serverTimingHeader({ path: "/today", kind: "html", at: 0, queries: 7, dbMs: 12.3, dbWallMs: 8, totalMs: 40 })).toBe(
      'db;dur=12.3;desc="7 queries", dbwall;dur=8, app;dur=40',
    );
  });
});
