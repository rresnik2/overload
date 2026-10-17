import Link from "next/link";
import { SEVERITY_LABEL, weekRangeLabel } from "@/components/insights/labels";
import type { InsightFacts, InsightReportRow } from "@/contracts/insights";

/** The finding to lead with: the first warning, else the first. */
export function topFinding(cards: InsightFacts["insights"]): InsightFacts["insights"][number] | undefined {
  return cards.find((c) => c.severity === "warning") ?? cards[0];
}

/**
 * "Insight": the latest report's headline and its most important finding, with a yellow left edge. With no written report it leads
 * with the top rule-based finding of `preview` (the same findings /insights lists), and only a user with nothing to review yet is told
 * to wait. Server-renderable.
 */
export function TodayInsightCard({ report, preview = null }: { report: InsightReportRow | null; preview?: InsightFacts | null }) {
  if (!report) {
    const finding = preview ? topFinding(preview.insights) : undefined;
    if (preview && finding) {
      return (
        <section className="today-panel today-insight" aria-labelledby="today-insight-title">
          <h2 id="today-insight-title" className="type-label today-label">
            Insight · {weekRangeLabel(preview.weekStart)}
          </h2>
          <p>
            <b>{finding.title}</b>
          </p>
          <p className="today-muted">
            {SEVERITY_LABEL[finding.severity]}
            {preview.insights.length > 1 ? ` · ${preview.insights.length} findings this week` : ""}
          </p>
          <Link href="/insights" className="today-link">
            Read the full review
          </Link>
        </section>
      );
    }
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
  const top = topFinding(report.facts.insights);
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
