// The weekly insight pipeline: load -> facts -> validate -> hash -> (dedupe | cap | generate) -> store.
// Cost controls enforced here: an unchanged factsHash returns the stored report with no model call; on-demand runs are
// capped per week; an empty week and a missing API key never reach the model; token counts are stored on every report.
import { InsightStatus, type InsightTrigger } from "@/contracts/enums";
import { insightFactsSchema, type InsightFacts, type InsightReportRow } from "@/contracts/insights";
import { addDays, isoWeekStart, toLocalDate, type LocalDate } from "@/lib/dates";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import type { AnalyticsInput } from "@/contracts/analytics";
import type { UserCtx } from "@/server/auth/ctx";
import { loadAnalyticsInput } from "@/server/queries/facts";
import { getNarrativeClient, insightsModel, type NarrativeClient } from "./client";
import { MAX_ON_DEMAND_PER_WEEK, PROMPT_VERSION } from "./constants";
import { factsHash } from "./hash";
import { generateNarrative } from "./narrative";
import { prismaReportStore, type ReportStore } from "./reports";

export interface PipelineDeps {
  store: ReportStore;
  loadInput: (ctx: UserCtx, opts: { today: LocalDate }) => Promise<AnalyticsInput>;
  client: NarrativeClient | null;
  model: string;
  now: () => Date;
}

export function defaultDeps(): PipelineDeps {
  return { store: prismaReportStore, loadInput: loadAnalyticsInput, client: getNarrativeClient(), model: insightsModel(), now: () => new Date() };
}

/**
 * The week a report reviews: the last COMPLETED ISO week before the user's local today. The rule engine judges exactly that
 * week (stream D), and a Monday cron then always has a full week to talk about, in every time zone.
 */
export function reviewWeekStart(today: LocalDate): LocalDate {
  return addDays(isoWeekStart(today), -7);
}

export type GenerateStatus = "generated" | "cached" | "empty" | "failed" | "rate_limited" | "in_progress";

export interface GenerateResult {
  status: GenerateStatus;
  report: InsightReportRow | null;
  /** On-demand regenerations left this week. */
  remaining: number;
}

const remainingOf = (used: number) => Math.max(0, MAX_ON_DEMAND_PER_WEEK - used);

export async function generateInsightReport(
  ctx: UserCtx,
  opts: { trigger: InsightTrigger },
  deps: PipelineDeps = defaultDeps(),
): Promise<GenerateResult> {
  const { store, client, model } = deps;
  const now = deps.now();
  const today = toLocalDate(now, (await store.timezoneOf(ctx)) ?? "UTC");
  const weekStart = reviewWeekStart(today);

  const facts: InsightFacts = insightFactsSchema.parse(buildWeeklyFacts(await deps.loadInput(ctx, { today }), { weekStart }));
  const hash = factsHash(facts);

  const existing = await store.find(ctx, weekStart);
  const used = existing?.onDemandCount ?? 0;
  // Unchanged facts: the stored report is the answer. No model call, no regeneration consumed.
  if (existing?.row && existing.status === InsightStatus.READY && existing.factsHash === hash) {
    return { status: "cached", report: existing.row, remaining: remainingOf(used) };
  }

  const base = { facts, factsHash: hash, trigger: opts.trigger, model: null, promptVersion: null, inputTokens: null, outputTokens: null };
  if (facts.training.completedSets === 0) {
    const report = await store.save(ctx, { weekStart, ...base, status: InsightStatus.READY, narrative: null, error: null });
    return { status: "empty", report, remaining: remainingOf(used) };
  }
  if (!client) {
    const report = await store.save(ctx, { weekStart, ...base, status: InsightStatus.FAILED, narrative: null, error: "ANTHROPIC_API_KEY is not configured" });
    return { status: "failed", report, remaining: remainingOf(used) };
  }

  const claim = await store.begin(ctx, { weekStart, trigger: opts.trigger, facts, factsHash: hash, maxOnDemand: MAX_ON_DEMAND_PER_WEEK, now });
  if (!claim.ok) return { status: claim.reason, report: existing?.row ?? null, remaining: remainingOf(used) };

  const result = await generateNarrative(facts, { client, model });
  const report = await store.finish(ctx, claim.id, {
    ...base,
    status: result.narrative ? InsightStatus.READY : InsightStatus.FAILED,
    narrative: result.narrative,
    model,
    promptVersion: PROMPT_VERSION,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    error: result.error,
  });
  return { status: result.narrative ? "generated" : "failed", report, remaining: remainingOf(report.onDemandCount) };
}
