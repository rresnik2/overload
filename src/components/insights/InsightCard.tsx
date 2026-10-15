import clsx from "clsx";
import type { ReactNode } from "react";
import type { InsightCard as InsightCardData } from "@/contracts/analytics";
import { InfoHint } from "@/components/ui/InfoHint";
import type { InsightRuleId } from "@/contracts/analytics";
import { CITATIONS } from "@/lib/analytics/constants";
import type { TermId } from "@/lib/glossary";
import { SEVERITY_LABEL } from "./labels";

/** Which glossary terms explain each rule's evidence. Exhaustive: a new rule id fails the type check until it has hints. */
const RULE_HINTS: Record<InsightRuleId, readonly TermId[]> = {
  "volume-band": ["hardSet", "fractionalSets", "targetBand"],
  "stalled-lift": ["stall", "deload"],
  "double-progression": ["doubleProgression"],
  "effort-check": ["proximityToFailure", "rir"],
  "frequency-session-cap": ["weeklySets"],
  "rep-range-goal": ["repRange", "trainingGoal"],
  "relative-strength-percentile": ["e1rm"],
  "on-track-vs-population": ["forecastBands"],
  "ffmi-context": ["ffmi", "bodyFatMethods"],
  "cut-strength-drop": ["bodyweightTrend", "trainingGoal"],
  "weight-change-rate": ["rateOfLoss", "bodyweightTrend"],
};

export interface InsightCardProps {
  card: InsightCardData;
  /** Start expanded (default collapsed). */
  defaultOpen?: boolean;
  className?: string;
}

function evidenceValue(v: InsightCardData["evidence"][number]): ReactNode {
  return (
    <>
      <span className="num">{v.value}</span>
      {v.unit ? <span className="insight-card__unit"> {v.unit}</span> : null}
    </>
  );
}

/**
 * One rule-engine finding. Native <details>: collapsed it shows severity + title, expanded the body, the evidence it was
 * computed from and links to the sources. Works without JavaScript; severity is spelled out, never colour alone.
 */
export function InsightCard({ card, defaultOpen = false, className }: InsightCardProps) {
  const citations = card.citations.flatMap((key) => CITATIONS[key] ?? []);
  return (
    <details className={clsx("insight-card", `insight-card--${card.severity}`, className)} open={defaultOpen} data-severity={card.severity} data-rule={card.ruleId}>
      <summary className="insight-card__summary">
        <span className="insight-card__badge">{SEVERITY_LABEL[card.severity]}</span>
        <span className="insight-card__title">{card.title}</span>
        <span className="insight-card__chevron" aria-hidden="true" />
      </summary>
      <div className="insight-card__body">
        <p>{card.body}</p>
        {card.evidence.length > 0 ? (
          <p className="insight-card__evidence-head">
            Evidence
            <InfoHint term="insightEvidence" />
            {RULE_HINTS[card.ruleId]?.map((term) => <InfoHint key={term} term={term} />)}
          </p>
        ) : null}
        {card.evidence.length > 0 ? (
          <dl className="insight-card__evidence" aria-label="Evidence">
            {card.evidence.map((e, i) => (
              <div key={`${e.label}-${i}`} className="insight-card__fact">
                <dt>{e.label}</dt>
                <dd>{evidenceValue(e)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {citations.length > 0 ? (
          <div className="insight-card__sources">
            <span className="insight-card__sources-label">Sources</span>
            <ul>
              {citations.map((c) => (
                <li key={c.key}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="link-underline">
                    {c.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
