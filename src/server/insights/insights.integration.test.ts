// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
// The Prisma ReportStore end to end with the Anthropic client mocked: hash dedupe, the weekly on-demand cap (also under
// concurrent clicks), PENDING locking, user isolation, and the cron's view of the table.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { InsightTrigger } from "@/contracts/enums";
import { insightFactsSchema } from "@/contracts/insights";
import { makeSet } from "@/lib/fixtures/factories";
import { generateLifterHistory } from "@/lib/fixtures/generate";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { MAX_ON_DEMAND_PER_WEEK } from "./constants";
import { prismaCronStore, runInsightsCron, type CronDeps } from "./cron";
import { generateInsightReport, type PipelineDeps } from "./pipeline";
import { prismaReportStore, listReports } from "./reports";
import { groundedNarrative, messageOf, mockClient, WEEK_START } from "./test-support";

const suffix = newId().slice(-12);
const [userA, userB, userC] = ["a", "b", "c"].map((k) => `ins-${k}-${suffix}`) as [string, string, string];
const [ctxA, ctxB] = [mintUserCtx(userA), mintUserCtx(userB)];
const NOW = new Date("2026-10-12T16:00:00Z");
const base = generateLifterHistory({ today: "2026-10-11" });

beforeAll(async () => {
  for (const id of [userA, userB, userC]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  await prisma.profile.create({ data: { userId: userC, timezone: "America/New_York", insightsEnabled: true, onboardedAt: NOW } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB, userC] } } });
});

function changingInput() {
  let n = 0;
  return async () => {
    n += 1;
    const extra = Array.from({ length: n }, (_, i) => makeSet({ id: `x-${n}-${i}`, workoutId: base.sets[0]!.workoutId, exerciseId: base.sets[0]!.exerciseId, seriesKey: base.sets[0]!.seriesKey, localDate: "2026-10-06", reps: 8, weightKg: 60, effectiveLoadKg: 60, rir: 2 }));
    return { ...base, today: "2026-10-12", sets: [...base.sets, ...extra] };
  };
}

function deps(loadInput: PipelineDeps["loadInput"]) {
  const m = mockClient(messageOf("{}"));
  m.create.mockImplementation(async (params) => messageOf(groundedNarrative(JSON.parse(params.messages[0]!.content as string))));
  return { deps: { store: prismaReportStore, loadInput, client: m.client, model: "test-model", now: () => NOW } satisfies PipelineDeps, create: m.create };
}

describe("InsightReport pipeline on Postgres", () => {
  it("stores the report with token counts and returns it unchanged for the same facts (no second model call)", async () => {
    const t = deps(async () => ({ ...base, today: "2026-10-12" }));
    const first = await generateInsightReport(ctxA, { trigger: InsightTrigger.CRON }, t.deps);
    expect(first.status).toBe("generated");
    expect(first.report).toMatchObject({ weekStart: WEEK_START, status: "READY", model: "test-model", inputTokens: 100, outputTokens: 50 });
    const stored = await prisma.insightReport.findFirstOrThrow({ where: { userId: userA } });
    expect(stored).toMatchObject({ onDemandCount: 0, trigger: "CRON", promptVersion: expect.any(String) });
    expect(insightFactsSchema.safeParse(stored.facts).success).toBe(true);

    const again = await generateInsightReport(ctxA, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
    expect(again).toMatchObject({ status: "cached", remaining: MAX_ON_DEMAND_PER_WEEK });
    expect(again.report!.id).toBe(first.report!.id);
    expect(t.create).toHaveBeenCalledTimes(1);
    expect((await prisma.insightReport.findFirstOrThrow({ where: { userId: userA } })).onDemandCount).toBe(0);
  });

  it("refuses the fourth on-demand regeneration in a week", async () => {
    const t = deps(changingInput());
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await generateInsightReport(ctxA, { trigger: InsightTrigger.ON_DEMAND }, t.deps)).status);
    expect(statuses).toEqual(["generated", "generated", "generated", "rate_limited"]);
    expect(t.create).toHaveBeenCalledTimes(3);
    expect((await prisma.insightReport.findFirstOrThrow({ where: { userId: userA } })).onDemandCount).toBe(3);
  });

  it("holds the cap under concurrent clicks (atomic claim): never more than 3 model calls", async () => {
    const t = deps(changingInput());
    const results = await Promise.all(Array.from({ length: 8 }, () => generateInsightReport(ctxB, { trigger: InsightTrigger.ON_DEMAND }, t.deps)));
    expect(t.create.mock.calls.length).toBeLessThanOrEqual(MAX_ON_DEMAND_PER_WEEK);
    expect(results.filter((r) => r.status === "generated").length).toBe(t.create.mock.calls.length);
    expect((await prisma.insightReport.findFirstOrThrow({ where: { userId: userB } })).onDemandCount).toBeLessThanOrEqual(MAX_ON_DEMAND_PER_WEEK);
  });

  it("never shows one user's reports to another", async () => {
    expect((await listReports(ctxA)).length).toBe(1);
    expect((await listReports(mintUserCtx(userC))).length).toBe(0);
    expect(await prismaReportStore.find(ctxB, "2000-01-03")).toBeNull();
  });
});

describe("cron on Postgres", () => {
  it("picks up an onboarded user with no READY report, then skips them once one exists", async () => {
    const cronDeps = (generate: CronDeps["generate"]): CronDeps => ({
      store: {
        eligibleUsers: async () => (await prismaCronStore.eligibleUsers()).filter((u) => u.id === userC),
        readyReports: prismaCronStore.readyReports,
      },
      now: () => NOW,
      generate,
      concurrency: 2,
      budgetMs: 60_000,
    });
    const t = deps(async () => ({ ...base, today: "2026-10-12" }));
    const generate = vi.fn((ctx: ReturnType<typeof mintUserCtx>) => generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps));
    expect(await runInsightsCron(cronDeps(generate))).toMatchObject({ eligible: 1, generated: 1, alreadyReady: 0 });
    expect(await runInsightsCron(cronDeps(generate))).toMatchObject({ eligible: 1, generated: 0, alreadyReady: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
