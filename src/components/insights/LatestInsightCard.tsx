import Link from "next/link";
import { HardCard } from "@/components/primitives/HardCard";
import type { InsightReportRow } from "@/contracts/insights";
import { SEVERITY_LABEL, weekRangeLabel } from "./labels";

/**
 * Wave 3 export for /today: the latest report's headline and its most important finding, linking to /insights.
 * Pass `await latestReport(ctx)` from `@/server/insights/reports`; null renders the empty state.
 */
export function LatestInsightCard({ report }: { report: InsightReportRow | null }) {
  if (!report) {
    return (
      <HardCard as="section" aria-labelledby="latest-insight-title">
        <h2 id="latest-insight-title" className="insight-latest__label">Latest insight</h2>
        <p>Your first weekly review appears after a week of logged training.</p>
        <Link href="/insights" className="link-underline">Open insights</Link>
      </HardCard>
    );
  }
  const top = report.facts.insights.find((c) => c.severity === "warning") ?? report.facts.insights[0];
  return (
    <HardCard as="section" aria-labelledby="latest-insight-title">
      <h2 id="latest-insight-title" className="insight-latest__label">Latest insight, {weekRangeLabel(report.weekStart)}</h2>
      <p className="insight-latest__headline">{report.narrative?.headline ?? top?.title ?? "No findings this week"}</p>
      {report.narrative && top ? (
        <p className="insight-latest__top">
          <span className="insight-card__badge">{SEVERITY_LABEL[top.severity]}</span> {top.title}
        </p>
      ) : null}
      <Link href="/insights" className="link-underline">Read the full review</Link>
    </HardCard>
  );
}
