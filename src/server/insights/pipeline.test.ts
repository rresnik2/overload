import { describe, expect, it, vi } from "vitest";
import { InsightStatus, InsightTrigger } from "@/contracts/enums";
import type { AnalyticsInput } from "@/contracts/analytics";
import { makeSet } from "@/lib/fixtures/factories";
import { generateLifterHistory } from "@/lib/fixtures/generate";
import { mintUserCtx } from "@/server/auth/ctx";
import { MAX_ON_DEMAND_PER_WEEK, PROMPT_VERSION } from "./constants";
import { createMemoryStore } from "./memory-store";
import { generateInsightReport, reviewWeekStart, type PipelineDeps } from "./pipeline";
import { groundedNarrative, messageOf, mockClient, WEEK_START } from "./test-support";
import { insightFactsSchema } from "@/contracts/insights";
import { buildWeeklyFacts } from "@/lib/analytics/facts";

const ctx = mintUserCtx("user-1");
/** Monday 2026-10-12 in New York: the review week is the one starting 2026-10-05, the fixture's last complete week. */
const NOW = new Date("2026-10-12T16:00:00Z");
const factsOf = (input: AnalyticsInput) => insightFactsSchema.parse(buildWeeklyFacts(input, { weekStart: WEEK_START }));

/** The model answers with a narrative grounded in whatever facts it is given. */
function groundedClient() {
  const m = mockClient(messageOf("{}"));
  m.create.mockImplementation(async (params) => messageOf(groundedNarrative(JSON.parse(params.messages[0]!.content as string))));
  return m;
}

function setup(opts: { input?: () => AnalyticsInput; client?: PipelineDeps["client"]; timezone?: string | null } = {}) {
  const base = generateLifterHistory({ today: "2026-10-11" });
  const { store, entries } = createMemoryStore({ timezone: opts.timezone, now: () => NOW });
  const loadInput = vi.fn(async () => (opts.input ? opts.input() : { ...base, today: "2026-10-12" }));
  const m = groundedClient();
  const deps: PipelineDeps = { store, loadInput, client: opts.client === undefined ? m.client : opts.client, model: "test-model", now: () => NOW };
  return { deps, store, entries, loadInput, create: m.create };
}

/** Each call sees one more completed set in the review week, so the facts hash changes every time. */
function changingInput() {
  const base = generateLifterHistory({ today: "2026-10-11" });
  let n = 0;
  return () => {
    n += 1;
    const extra = Array.from({ length: n }, (_, i) => makeSet({ id: `extra-${n}-${i}`, workoutId: base.sets[0]!.workoutId, exerciseId: base.sets[0]!.exerciseId, seriesKey: base.sets[0]!.seriesKey, localDate: "2026-10-06", reps: 8, weightKg: 60, effectiveLoadKg: 60, rir: 2 }));
    return { ...base, today: "2026-10-12", sets: [...base.sets, ...extra] };
  };
}

describe("reviewWeekStart", () => {
  it("is the last completed ISO week", () => {
    expect(reviewWeekStart("2026-10-12")).toBe("2026-10-05");
    expect(reviewWeekStart("2026-10-18")).toBe("2026-10-05");
    expect(reviewWeekStart("2026-10-19")).toBe("2026-10-12");
  });
});

describe("generateInsightReport", () => {
  it("generates, stores the narrative, model, prompt version and token counts", async () => {
    const t = setup();
    const r = await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps);
    expect(r.status).toBe("generated");
    expect(r.report).toMatchObject({ weekStart: WEEK_START, status: InsightStatus.READY, trigger: "CRON", model: "test-model", promptVersion: PROMPT_VERSION, inputTokens: 100, outputTokens: 50, error: null });
    expect(r.report!.narrative!.headline).toContain(WEEK_START);
    expect(r.report!.factsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.report!.generatedAt).not.toBeNull();
    expect(r.remaining).toBe(MAX_ON_DEMAND_PER_WEEK);
  });

  it("hash dedupe: unchanged facts return the stored report with no model call and no regeneration used", async () => {
    const t = setup();
    const first = await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps);
    expect(t.create).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      const again = await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
      expect(again.status).toBe("cached");
      expect(again.report).toEqual(first.report);
      expect(again.remaining).toBe(MAX_ON_DEMAND_PER_WEEK);
    }
    expect(t.create).toHaveBeenCalledTimes(1);
  });

  it("rate limit: the fourth on-demand regeneration in a week is refused and calls no model", async () => {
    const t = setup({ input: changingInput() });
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) outcomes.push((await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps)).status);
    expect(outcomes).toEqual(["generated", "generated", "generated", "rate_limited"]);
    expect(t.create).toHaveBeenCalledTimes(3);
    const refused = await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
    expect(refused).toMatchObject({ status: "rate_limited", remaining: 0 });
    expect(refused.report?.narrative).not.toBeNull(); // the last good report is still shown
    expect(t.create).toHaveBeenCalledTimes(3);
  });

  it("the cron's own generation does not consume a regeneration, so a cron week allows three more on demand", async () => {
    const t = setup({ input: changingInput() });
    expect((await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps)).status).toBe("generated");
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps)).status);
    expect(statuses).toEqual(["generated", "generated", "generated", "rate_limited"]);
  });

  it("never starts a second run while a fresh one is in progress", async () => {
    const t = setup();
    let release!: () => void;
    t.create.mockImplementationOnce(async (params) => {
      await new Promise<void>((resolve) => (release = resolve));
      return messageOf(groundedNarrative(JSON.parse(params.messages[0]!.content as string)));
    });
    const slow = generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
    await vi.waitFor(() => expect(t.create).toHaveBeenCalledTimes(1));
    const second = await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
    expect(second.status).toBe("in_progress");
    release();
    expect((await slow).status).toBe("generated");
    expect(t.create).toHaveBeenCalledTimes(1);
  });

  it("falls back to the rules-only report when the narrative cannot be grounded (FAILED + error, facts kept)", async () => {
    const bad = mockClient(messageOf({ ...groundedNarrative(factsOf(generateLifterHistory({ today: "2026-10-11" }))), summary: "You lifted 317.5 kg." }));
    const t = setup({ client: bad.client });
    const r = await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps);
    expect(bad.create).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("failed");
    expect(r.report).toMatchObject({ status: InsightStatus.FAILED, narrative: null, model: "test-model", inputTokens: 200 });
    expect(r.report!.error).toContain("317.5");
    expect(r.report!.facts.insights.length).toBeGreaterThan(0); // the rule cards are still there
  });

  it("serves rules-only cards without an API key and never claims a regeneration", async () => {
    const t = setup({ client: null });
    const r = await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND }, t.deps);
    expect(r).toMatchObject({ status: "failed", remaining: MAX_ON_DEMAND_PER_WEEK });
    expect(r.report).toMatchObject({ narrative: null, error: "ANTHROPIC_API_KEY is not configured" });
    expect(t.entries.get(WEEK_START)!.onDemandCount).toBe(0);
  });

  it("does not call the model for a week with no completed sets", async () => {
    const base = generateLifterHistory({ today: "2026-10-11" });
    const t = setup({ input: () => ({ ...base, today: "2026-10-12", sets: base.sets.filter((s) => s.localDate < WEEK_START) }) });
    const r = await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps);
    expect(r.status).toBe("empty");
    expect(r.report).toMatchObject({ status: InsightStatus.READY, narrative: null });
    expect(t.create).not.toHaveBeenCalled();
  });

  it("uses the user's own time zone for 'today'", async () => {
    // 2026-10-12T16:00Z is Monday everywhere between UTC-12 and UTC+8; in UTC+14 it is already Tuesday, still the same review week.
    const t = setup({ timezone: "Pacific/Kiritimati" });
    const r = await generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, t.deps);
    expect(r.report!.weekStart).toBe(WEEK_START);
    expect(t.loadInput).toHaveBeenCalledWith(ctx, { today: "2026-10-13" });
  });
});
