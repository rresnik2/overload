import { afterEach, describe, expect, it, vi } from "vitest";
import type * as CronModule from "./cron";
import { isCronAuthorized, reviewWeekFor, runInsightsCron, type CronDeps, type CronUser } from "./cron";
import type { GenerateResult } from "./pipeline";

const SECRET = "s".repeat(32);

describe("cron authorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isCronAuthorized(`Bearer ${SECRET}`, SECRET)).toBe(true);
    expect(isCronAuthorized(null, SECRET)).toBe(false);
    expect(isCronAuthorized("", SECRET)).toBe(false);
    expect(isCronAuthorized(SECRET, SECRET)).toBe(false);
    expect(isCronAuthorized(`Bearer ${SECRET}x`, SECRET)).toBe(false);
    expect(isCronAuthorized("Bearer wrong", SECRET)).toBe(false);
  });
  it("never authorizes when no secret is configured", () => {
    expect(isCronAuthorized("Bearer undefined", undefined)).toBe(false);
    expect(isCronAuthorized("Bearer ", "")).toBe(false);
  });
});

describe("GET /api/cron/insights", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock("@/server/insights/cron");
  });

  async function route(runner = vi.fn(async () => ({ eligible: 0 }))) {
    vi.resetModules();
    vi.doMock("@/server/insights/cron", async (importActual) => ({ ...(await importActual<typeof CronModule>()), runInsightsCron: runner }));
    return { GET: (await import("@/app/api/cron/insights/route")).GET, runner };
  }

  it("answers 401 without the secret and never runs the job", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET, runner } = await route();
    for (const headers of [{}, { authorization: "Bearer nope" }, { authorization: SECRET }] as Record<string, string>[]) {
      const res = await GET(new Request("http://localhost/api/cron/insights", { headers }));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
    expect(runner).not.toHaveBeenCalled();
  });
  it("answers 401 for everyone when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET, runner } = await route();
    const res = await GET(new Request("http://localhost/api/cron/insights", { headers: { authorization: "Bearer " } }));
    expect(res.status).toBe(401);
    expect(runner).not.toHaveBeenCalled();
  });
  it("runs the job and returns its summary with the secret", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET, runner } = await route(vi.fn(async () => ({ eligible: 3 })));
    const res = await GET(new Request("http://localhost/api/cron/insights", { headers: { authorization: `Bearer ${SECRET}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eligible: 3 });
    expect(runner).toHaveBeenCalledOnce();
  });
});

describe("review week by local time zone", () => {
  // The cron runs daily at 12:00 UTC. Whatever the zone, the review week is the last COMPLETED ISO week of the user's own calendar.
  const at = (iso: string) => new Date(iso);

  it("is the same week for every zone at the Monday 12:00 UTC run (UTC-12 .. UTC+14)", () => {
    const monday = at("2026-10-12T12:00:00Z");
    for (const tz of ["Etc/GMT+12", "Pacific/Pago_Pago", "America/Los_Angeles", "America/New_York", "UTC", "Europe/Berlin", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland", "Pacific/Kiritimati"]) {
      expect(reviewWeekFor(monday, tz), tz).toBe("2026-10-05");
    }
  });
  it("rolls over at the user's local midnight, not at UTC midnight", () => {
    // Sunday 23:30 in New York is already Monday 03:30Z (UTC date Monday), but the local week is still running.
    expect(reviewWeekFor(at("2026-10-12T03:30:00Z"), "America/New_York")).toBe("2026-09-28");
    expect(reviewWeekFor(at("2026-10-12T03:30:00Z"), "UTC")).toBe("2026-10-05");
    // Kiritimati (UTC+14) is on Tuesday while UTC is still Monday.
    expect(reviewWeekFor(at("2026-10-11T10:30:00Z"), "Pacific/Kiritimati")).toBe("2026-10-05"); // Monday 00:30 local
    expect(reviewWeekFor(at("2026-10-11T09:30:00Z"), "Pacific/Kiritimati")).toBe("2026-09-28"); // Sunday 23:30 local
  });
  it("holds across DST transitions (US 2026-11-01, EU 2026-10-25, AU 2026-10-04)", () => {
    // US fall back: Sunday 2026-11-01 01:30 happens twice; Monday 2026-11-02 12:00Z is 07:00 EST.
    expect(reviewWeekFor(at("2026-11-02T12:00:00Z"), "America/New_York")).toBe("2026-10-26");
    expect(reviewWeekFor(at("2026-11-02T04:59:00Z"), "America/New_York")).toBe("2026-10-19"); // Sunday 23:59 EST (Monday starts at 05:00Z)
    // EU fall back: Monday 2026-10-26 12:00Z is 12:00 CET (+1) after the change.
    expect(reviewWeekFor(at("2026-10-26T12:00:00Z"), "Europe/Berlin")).toBe("2026-10-19");
    expect(reviewWeekFor(at("2026-10-25T22:59:00Z"), "Europe/Berlin")).toBe("2026-10-12"); // Sunday 23:59 CET
    // AU spring forward on Sunday 2026-10-04: Monday 2026-10-05 12:00Z is already Monday 23:00 AEDT.
    expect(reviewWeekFor(at("2026-10-05T12:00:00Z"), "Australia/Sydney")).toBe("2026-09-28");
    expect(reviewWeekFor(at("2026-10-05T13:30:00Z"), "Australia/Sydney")).toBe("2026-09-28"); // Tuesday 00:30 AEDT, same review week
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(reviewWeekFor(at("2026-10-12T12:00:00Z"), "Not/AZone")).toBe("2026-10-05");
  });
});

describe("runInsightsCron", () => {
  const NOW = new Date("2026-10-12T12:00:00Z");
  const users: CronUser[] = ["a", "b", "c", "d"].map((id) => ({ id, timezone: "America/New_York" }));
  const result = (status: GenerateResult["status"]): GenerateResult => ({ status, report: null, remaining: 3 });

  function deps(over: Partial<CronDeps> & { ready?: string[] } = {}): CronDeps {
    return {
      store: { eligibleUsers: async () => users, readyReports: async () => new Set(over.ready ?? []) },
      now: () => NOW,
      generate: async () => result("generated"),
      concurrency: 2,
      budgetMs: 60_000,
      ...over,
    };
  }

  it("generates for every user whose review week has no READY report, and skips the rest", async () => {
    const seen: string[] = [];
    const summary = await runInsightsCron(deps({ ready: ["a|2026-10-05", "c|2026-10-05"], generate: async (ctx) => (seen.push(ctx.id), result("generated")) }));
    expect(seen.sort()).toEqual(["b", "d"]);
    expect(summary).toMatchObject({ eligible: 4, alreadyReady: 2, generated: 2, errors: 0, deferred: 0 });
  });
  it("one user's failure never stops the rest", async () => {
    const seen: string[] = [];
    const summary = await runInsightsCron(
      deps({
        generate: async (ctx) => {
          seen.push(ctx.id);
          if (ctx.id === "b") throw new Error("boom");
          return result(ctx.id === "c" ? "failed" : "generated");
        },
      }),
    );
    expect(seen.sort()).toEqual(["a", "b", "c", "d"]);
    expect(summary).toMatchObject({ generated: 2, failed: 1, errors: 1 });
  });
  it("bounds concurrency", async () => {
    let active = 0;
    let peak = 0;
    await runInsightsCron(
      deps({
        concurrency: 2,
        generate: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active -= 1;
          return result("generated");
        },
      }),
    );
    expect(peak).toBe(2);
  });
  it("defers users it has no time for", async () => {
    const summary = await runInsightsCron(deps({ budgetMs: -1, generate: async () => result("generated") }));
    expect(summary).toMatchObject({ generated: 0, deferred: 4 });
  });
  it("looks up each user's review week in their own zone", async () => {
    const asked: string[][] = [];
    await runInsightsCron({
      ...deps(),
      store: {
        eligibleUsers: async () => [{ id: "ny", timezone: "America/New_York" }, { id: "ki", timezone: "Pacific/Kiritimati" }],
        readyReports: async (_ids, weeks) => (asked.push(weeks), new Set()),
      },
      now: () => new Date("2026-10-12T03:30:00Z"), // NY still Sunday (week 09-28 under review), Kiritimati already Monday 17:30 (10-05)
    });
    expect(asked[0]!.sort()).toEqual(["2026-09-28", "2026-10-05"]);
  });
});
