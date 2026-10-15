import clsx from "clsx";
import type { ReactNode } from "react";
import type { InsightCard as InsightCardData } from "@/contracts/analytics";
import { CITATIONS } from "@/lib/analytics/constants";
import { SEVERITY_LABEL } from "./labels";

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
