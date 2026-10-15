import Link from "next/link";
import { Star } from "lucide-react";
import { MODALITY_LABEL } from "@/components/exercises/labels";
import { formatDate, unitLabel, weightText } from "@/components/charts/format";
import { HardCard } from "@/components/primitives/HardCard";
import type { PrType } from "@/contracts/enums";
import type { WeightUnit } from "@/lib/units";
import { PR_TYPE_LABEL, PR_VALUE_KIND, type PrBoard, type PrEntry } from "@/server/queries/prs.shape";

function valueText(type: PrType, value: number, unit: WeightUnit): string {
  return PR_VALUE_KIND[type] === "reps" ? `${value} reps` : `${weightText(value, unit, type === "MAX_SESSION_VOLUME" || type === "MAX_SET_VOLUME" ? 0 : 1)} ${unitLabel(unit)}`;
}

function recordLabel(r: Pick<PrEntry, "type" | "reps">): string {
  return r.type === "REP_MAX" ? `${r.reps}-rep max` : PR_TYPE_LABEL[r.type];
}

export function PrBoardView({ board, unit }: { board: PrBoard; unit: WeightUnit }) {
  return (
    <div className="pr-board" data-testid="pr-board">
      {board.recent.length > 0 ? (
        <section aria-labelledby="pr-recent" className="progress-section">
          <h2 id="pr-recent" className="progress-subhead">Latest records</h2>
          <ul className="pr-recent">
            {board.recent.map((r) => (
              <li key={`${r.seriesKey}:${r.type}:${r.reps}`} className="pr-recent__item">
                <Star size={16} fill="currentColor" strokeWidth={0} className="pr-star" aria-hidden="true" />
                <span>
                  <strong>{r.exerciseName}</strong>
                  {r.seriesLabel !== "Default" ? ` (${r.seriesLabel})` : ""}: {recordLabel(r)} <span className="num">{valueText(r.type, r.value, unit)}</span>
                  {r.previousValue != null ? <span className="pr-recent__prev num"> up from {valueText(r.type, r.previousValue, unit)}</span> : null}
                </span>
                <span className="pr-recent__date num">{formatDate(r.localDate, true)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <h2 id="pr-by-lift" className="progress-subhead pr-by-lift">By exercise</h2>
      <div className="pr-grid" aria-labelledby="pr-by-lift" role="group">
        {board.series.map((b) => (
          <HardCard as="article" key={b.seriesKey} className="pr-card" aria-labelledby={`pr-${b.seriesKey}`}>
            <h3 id={`pr-${b.seriesKey}`} className="pr-card__name">
              <Link href={`/progress/${b.exerciseId}${b.seriesKey.includes(":") ? `?series=${encodeURIComponent(b.seriesKey)}` : ""}`} className="link link-hover">
                {b.exerciseName}
              </Link>
            </h3>
            <p className="series-card__meta">
              {MODALITY_LABEL[b.modality]}
              {b.seriesLabel !== "Default" ? ` / ${b.seriesLabel}` : ""}
            </p>
            <table className="chart-table num pr-card__table">
              <caption className="sr-only">Records for {b.exerciseName} {b.seriesLabel}</caption>
              <thead>
                <tr>
                  <th scope="col">Record</th>
                  <th scope="col">Best</th>
                  <th scope="col">Set on</th>
                </tr>
              </thead>
              <tbody>
                {b.records.map((r) => (
                  <tr key={`${r.type}:${r.reps}`}>
                    <th scope="row">{recordLabel(r)}</th>
                    <td>{valueText(r.type, r.value, unit)}</td>
                    <td>{formatDate(r.localDate, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HardCard>
        ))}
      </div>
    </div>
  );
}
