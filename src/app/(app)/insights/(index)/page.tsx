// /insights: this week's review (narrative + rule cards), regenerate, and the history of earlier weeks.
import Link from "next/link";
import { weekRangeLabel } from "@/components/insights/labels";
import { RegenerateButton } from "@/components/insights/RegenerateButton";
import { ReportView } from "@/components/insights/ReportView";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireUser } from "@/server/auth/session";
import { MAX_ON_DEMAND_PER_WEEK } from "@/server/insights/constants";
import { loadInsightsOverview } from "@/server/insights/current";

export const metadata = { title: "Insights" };
// The regenerate Server Action runs under this route's limit; Hobby allows up to 60 s.
export const maxDuration = 60;

export default async function InsightsPage() {
  const ctx = await requireUser();
  const { weekStart, current, preview, history, remaining } = await loadInsightsOverview(ctx);
  const facts = current?.facts ?? preview!;

  return (
    <>
      <PageHeader
        title="Insights"
        meta={["Weekly review", weekRangeLabel(weekStart)]}
        description="What last week's training says, from your logged sets. Findings come from fixed rules with cited evidence; the written review is generated from the same numbers."
        actions={<RegenerateButton remaining={remaining} max={MAX_ON_DEMAND_PER_WEEK} label={current?.narrative ? "Regenerate review" : "Write this week's review"} />}
      />
      <PageIntro id="insights">
        Each week Overload checks your logged sets against a few evidence-based rules. Open a finding to see the numbers behind it and its sources.
      </PageIntro>
      <ReportView facts={facts} report={current} />
      {current?.generatedAt ? (
        <p className="report__meta num">
          Generated {new Date(current.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
          {current.model ? ` with ${current.model}` : ""}.
        </p>
      ) : null}

      <section aria-labelledby="history-heading" className="insight-history">
        <SectionHeader title="Earlier weeks" index={3} id="history-heading" />
        {history.length > 0 ? (
          <ul className="insight-history__list">
            {history.map((r) => (
              <li key={r.id}>
                <Link href={`/insights/${r.weekStart}`} className="insight-history__item">
                  <span className="insight-history__week">{weekRangeLabel(r.weekStart)}</span>
                  <span className="insight-history__headline">{r.narrative?.headline ?? (r.facts.insights.length ? `${r.facts.insights.length} rule-based findings` : "No findings")}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="report__notice">Earlier reviews will collect here, one per week.</p>
        )}
      </section>
    </>
  );
}
