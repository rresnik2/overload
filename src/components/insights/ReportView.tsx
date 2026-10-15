import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { InsightFacts, InsightReportRow } from "@/contracts/insights";
import { InsightCard } from "./InsightCard";
import { NarrativePanel } from "./NarrativePanel";

export interface ReportViewProps {
  facts: InsightFacts;
  /** null = rules-only (not generated yet, or generation failed). */
  report: InsightReportRow | null;
}

/** A week's review: the narrative when there is one, then the rule cards, which are always shown. */
export function ReportView({ facts, report }: ReportViewProps) {
  const narrative = report?.narrative ?? null;
  const cards = facts.insights;
  return (
    <div className="report">
      {narrative ? (
        <HardCard as="section" className="report__narrative">
          <NarrativePanel narrative={narrative} facts={facts} />
        </HardCard>
      ) : (
        <p className="report__notice" role="status">
          {report?.status === "FAILED"
            ? "The written review could not be generated this time, so you are seeing the rule-based findings only."
            : facts.training.completedSets === 0
              ? "No completed sets this week, so there is nothing to review yet."
              : "No written review yet for this week. The rule-based findings are below."}
        </p>
      )}
      <section aria-labelledby="findings-heading">
        <SectionHeader title="Findings" index={narrative ? 2 : 1} id="findings-heading" />
        {cards.length > 0 ? (
          <ul className="report__cards">
            {cards.map((card) => (
              <li key={card.id}>
                <InsightCard card={card} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No findings this week" description="None of the ten checks flagged anything. Keep logging and they will update as your data grows." />
        )}
      </section>
    </div>
  );
}
