import Link from "next/link";
import { SEVERITY_LABEL, weekRangeLabel } from "@/components/insights/labels";
import type { InsightReportRow } from "@/contracts/insights";

/** "Insight": the latest report's headline and its most important finding, with a yellow left edge. Server-renderable. */
export function TodayInsightCard({ report }: { report: InsightReportRow | null }) {
  if (!report) {
    return (
      <section className="today-panel today-insight" aria-labelledby="today-insight-title">
        <h2 id="today-insight-title" className="type-label today-label">
          Insight
        </h2>
        <p>Your first weekly review appears after a week of logged training.</p>
        <Link href="/insights" className="today-link">
          Open insights
        </Link>
      </section>
    );
  }
  const top = report.facts.insights.find((c) => c.severity === "warning") ?? report.facts.insights[0];
  return (
    <section className="today-panel today-insight" aria-labelledby="today-insight-title">
      <h2 id="today-insight-title" className="type-label today-label">
        Insight · {weekRangeLabel(report.weekStart)}
      </h2>
      <p>
        <b>{report.narrative?.headline ?? top?.title ?? "No findings this week"}</b>
      </p>
      {report.narrative && top ? (
        <p className="today-muted">
          {SEVERITY_LABEL[top.severity]}: {top.title}
        </p>
      ) : null}
      <Link href="/insights" className="today-link">
        Read the full review
      </Link>
    </section>
  );
}
