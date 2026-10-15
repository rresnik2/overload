// What /insights shows for "this week's review": the stored report if there is one, otherwise the rule cards computed on the
// fly (deterministic, no model call, no tokens). Rules-only cards are therefore available even with no report and no API key.
import "server-only";
import { insightFactsSchema, type InsightFacts, type InsightReportRow } from "@/contracts/insights";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import { toLocalDate } from "@/lib/dates";
import type { UserCtx } from "@/server/auth/ctx";
import { loadAnalyticsInput } from "@/server/queries/facts";
import { MAX_ON_DEMAND_PER_WEEK } from "./constants";
import { reviewWeekStart } from "./pipeline";
import { listReports, prismaReportStore } from "./reports";

export interface InsightsOverview {
  weekStart: string;
  /** The stored report for the review week, if any. */
  current: InsightReportRow | null;
  /** Facts for the review week when no report is stored yet (rule cards only). */
  preview: InsightFacts | null;
  /** Earlier weeks, newest first (never includes `current`). */
  history: InsightReportRow[];
  remaining: number;
}

export async function loadInsightsOverview(ctx: UserCtx, now: Date = new Date()): Promise<InsightsOverview> {
  const today = toLocalDate(now, (await prismaReportStore.timezoneOf(ctx)) ?? "UTC");
  const weekStart = reviewWeekStart(today);
  const reports = await listReports(ctx, 13);
  const current = reports.find((r) => r.weekStart === weekStart) ?? null;
  const preview = current
    ? null
    : insightFactsSchema.parse(buildWeeklyFacts(await loadAnalyticsInput(ctx, { today }), { weekStart }));
  return {
    weekStart,
    current,
    preview,
    history: reports.filter((r) => r.weekStart !== weekStart),
    remaining: Math.max(0, MAX_ON_DEMAND_PER_WEEK - (current?.onDemandCount ?? 0)),
  };
}
