import type { InsightFacts, InsightNarrative } from "@/contracts/insights";
import { factRefLabel } from "./labels";

function Refs({ ids, facts }: { ids: string[]; facts: InsightFacts }) {
  if (!ids.length) return null;
  return (
    <ul className="narrative__refs" aria-label="Based on">
      {ids.map((id) => (
        <li key={id}>{factRefLabel(id, facts)}</li>
      ))}
    </ul>
  );
}

/** The Claude-written weekly review. Every section and action names the facts it is based on. */
export function NarrativePanel({ narrative, facts }: { narrative: InsightNarrative; facts: InsightFacts }) {
  return (
    <article className="narrative" aria-labelledby="narrative-headline">
      <h2 id="narrative-headline" className="narrative__headline">
        {narrative.headline}
      </h2>
      <p className="narrative__summary">{narrative.summary}</p>
      {narrative.sections.map((section, i) => (
        <section key={i} className="narrative__section">
          <h3>{section.title}</h3>
          <p>{section.body}</p>
          <Refs ids={section.factRefs} facts={facts} />
        </section>
      ))}
      {narrative.actions.length > 0 ? (
        <section className="narrative__actions" aria-label="Next week">
          <h3>Next week</h3>
          <ol>
            {narrative.actions.map((a, i) => (
              <li key={i}>
                <span>{a.text}</span>
                <Refs ids={a.factRefs} facts={facts} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
