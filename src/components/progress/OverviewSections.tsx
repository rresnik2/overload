import Link from "next/link";
import { MODALITY_LABEL } from "@/components/exercises/labels";
import { formatDate, modalityColor, modalityShape, plural, unitLabel, weightText } from "@/components/charts/format";
import { HardCard } from "@/components/primitives/HardCard";
import { Stat } from "@/components/ui/Stat";
import { Term } from "@/components/ui/Term";
import type { WeightUnit } from "@/lib/units";
import type { BigThree, SeriesCard } from "@/server/queries/progress.shape";

const LIFT_LABEL = { SQUAT: "Squat", BENCH_PRESS: "Bench press", DEADLIFT: "Deadlift" } as const;

/** One card per progression series. A machine at a second gym is its own card: machine numbers are never merged or converted. */
export function SeriesCards({ cards, unit }: { cards: SeriesCard[]; unit: WeightUnit }) {
  const u = unitLabel(unit);
  return (
    <ul className="series-cards" data-testid="series-cards">
      {cards.map((c) => (
        <li key={c.ref.seriesKey}>
          <Link href={`/progress/${c.ref.exerciseId}${c.ref.machineProfileId ? `?series=${encodeURIComponent(c.ref.seriesKey)}` : ""}`} className="series-card-link" data-series-key={c.ref.seriesKey}>
            <HardCard as="article" interactive className="series-card">
              <h3 className="series-card__name">{c.exerciseName}</h3>
              <p className="series-card__meta">
                <span className={`series-card__swatch series-card__swatch--${modalityShape(c.ref.modality)}`} style={{ background: modalityColor(c.ref.modality) }} aria-hidden="true" />
                {MODALITY_LABEL[c.ref.modality]}
                {c.ref.machineProfileId ? ` / ${c.ref.label}` : ""}
              </p>
              <Stat
                size="sm"
                label="Estimated 1RM"
                value={c.latestE1rmKg != null ? weightText(c.latestE1rmKg, unit) : "–"}
                unit={c.latestE1rmKg != null ? u : undefined}
                note={
                  c.deltaKg != null
                    ? `${c.deltaKg > 0 ? "+" : c.deltaKg < 0 ? "−" : ""}${weightText(Math.abs(c.deltaKg), unit)} ${u} vs 4 weeks ago`
                    : `${plural(c.setCount, "set")}, last ${formatDate(c.ref.lastLocalDate)}`
                }
              />
            </HardCard>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** DOTS needs the barbell squat + bench + deadlift. Machines never count; hidden entirely until the lifts exist. */
export function BigThreeCard({ bigThree, unit }: { bigThree: BigThree; unit: WeightUnit }) {
  const u = unitLabel(unit);
  const have = bigThree.lifts.filter((l) => l.e1rmKg != null);
  if (have.length === 0) return null;
  return (
    <HardCard as="section" aria-label="Powerlifting total and DOTS" className="bigthree" data-testid="bigthree">
      <div className="progress-stats">
        {bigThree.lifts.map((l) => (
          <Stat key={l.standardLift} size="sm" label={`${LIFT_LABEL[l.standardLift]} e1RM`} value={l.e1rmKg != null ? weightText(l.e1rmKg, unit) : "–"} unit={l.e1rmKg != null ? u : undefined} />
        ))}
        {bigThree.totalKg != null ? <Stat size="sm" label="Total" value={weightText(bigThree.totalKg, unit)} unit={u} /> : null}
        {bigThree.dots != null ? <Stat size="sm" label="DOTS" value={bigThree.dots.toFixed(1)} /> : null}
      </div>
      <p className="progress-note">
        {bigThree.dots != null
          ? <><Term id="dots">DOTS</Term> compares your estimated total with your bodyweight. Barbell squat, bench and deadlift only; machines are never scored.</>
          : <><Term id="dots">DOTS</Term> appears once you have logged a barbell squat, bench press and deadlift. Machines are never scored.</>}
      </p>
    </HardCard>
  );
}
