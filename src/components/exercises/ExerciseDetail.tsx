import clsx from "clsx";
import { HardCard } from "@/components/primitives/HardCard";
import { InfoHint } from "@/components/ui/InfoHint";
import type { TermId } from "@/lib/glossary";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { ExerciseRow } from "@/contracts/entities";
import { ExerciseImage } from "./ExerciseImage";
import { CATEGORY_LABEL, EQUIPMENT_LABEL, LEVEL_LABEL, LOAD_TYPE_HELP, LOAD_TYPE_LABEL, TRACKING_LABEL } from "./labels";
import { ModalityBadge } from "./ModalityBadge";
import { MuscleChips } from "./MuscleChips";
import type { SeriesSummary } from "./types";

/**
 * Everything about one exercise: photos, how the logged weight is read, muscles, instructions, and which progression
 * series the user has for it. Props only (the page loads the data). The title and meta line come from the page's PageHeader.
 */
export interface ExerciseDetailProps {
  exercise: ExerciseRow;
  /** The user's series for this exercise (default and per machine profile). Omit to hide the section. */
  series?: SeriesSummary[];
  className?: string;
}

const LOAD_TERM: Partial<Record<ExerciseRow["loadType"], TermId>> = {
  TOTAL: "loadTotal",
  PER_IMPLEMENT: "loadPerHand",
  PLATES_PER_SIDE: "loadPerSide",
  STACK: "loadStack",
  BODYWEIGHT_PLUS: "bodyweightPlus",
};

function seriesLabel(series: SeriesSummary): string {
  if (!series.machineProfile) return "Default";
  const { name, gymName, brand } = series.machineProfile;
  return [name, brand, gymName].filter(Boolean).join(" / ");
}

export function ExerciseDetail({ exercise, series, className }: ExerciseDetailProps) {
  const isMachine = exercise.modality === "MACHINE" || exercise.modality === "CABLE";
  return (
    <div className={clsx("exercise-detail", className)}>
      {exercise.images.length > 0 ? (
        <ul className="exercise-detail__photos">
          {exercise.images.map((path, i) => (
            <li key={path}>
              <ExerciseImage path={path} alt={`${exercise.name}, position ${i + 1}`} priority={i === 0} />
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="ex-facts" className="exercise-detail__section">
        <SectionHeader id="ex-facts" index={1} title="At a glance" />
        <HardCard as="div">
          <dl className="exercise-facts">
            <div>
              <dt>
                Type
                <InfoHint term="modalityTabs" />
              </dt>
              <dd>
                <ModalityBadge modality={exercise.modality} />
              </dd>
            </div>
            <div>
              <dt>Equipment</dt>
              <dd>{EQUIPMENT_LABEL[exercise.equipment]}</dd>
            </div>
            <div>
              <dt>You log</dt>
              <dd>{TRACKING_LABEL[exercise.tracking]}</dd>
            </div>
            <div>
              <dt>
                Weight is
                {LOAD_TERM[exercise.loadType] ? <InfoHint term={LOAD_TERM[exercise.loadType] as TermId} /> : null}
                {/assisted/i.test(exercise.name) ? <InfoHint term="assisted" /> : null}
              </dt>
              <dd>
                {LOAD_TYPE_LABEL[exercise.loadType]}
                {exercise.bodyweightFactor !== null ? <span className="num"> (about {Math.round(exercise.bodyweightFactor * 100)}% of bodyweight moves)</span> : null}
              </dd>
            </div>
            {exercise.isUnilateral ? (
              <div>
                <dt>Sides</dt>
                <dd>One side at a time</dd>
              </div>
            ) : null}
            <div>
              <dt>Category</dt>
              <dd>{CATEGORY_LABEL[exercise.category]}</dd>
            </div>
            {exercise.level ? (
              <div>
                <dt>Level</dt>
                <dd>{LEVEL_LABEL[exercise.level]}</dd>
              </div>
            ) : null}
          </dl>
          <p className="exercise-detail__help">{LOAD_TYPE_HELP[exercise.loadType]}</p>
          {isMachine ? (
            <p className="exercise-detail__help">
              Machines differ by gym and brand, so each machine you use keeps its own progression and is never converted to free-weight numbers.
              <InfoHint term="machineWeights" />
            </p>
          ) : null}
        </HardCard>
      </section>

      <section aria-labelledby="ex-muscles" className="exercise-detail__section">
        <SectionHeader id="ex-muscles" index={2} title="Muscles" />
        {exercise.muscles.length > 0 ? <MuscleChips muscles={exercise.muscles} /> : <p className="exercise-detail__empty">No muscles recorded.</p>}
      </section>

      {exercise.instructions.length > 0 ? (
        <section aria-labelledby="ex-how" className="exercise-detail__section">
          <SectionHeader id="ex-how" index={3} title="How to do it" />
          <ol className="exercise-detail__steps">
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {series ? (
        <section aria-labelledby="ex-series" className="exercise-detail__section">
          <SectionHeader id="ex-series" index={exercise.instructions.length > 0 ? 4 : 3} title="Your progression" actions={<InfoHint term="progressSeries" />} />
          {series.length === 0 ? (
            <p className="exercise-detail__empty">You have not logged this exercise yet.</p>
          ) : (
            <ul className="series-list">
              {series.map((s) => (
                <li key={s.seriesKey} className="series-list__item" data-series-key={s.seriesKey}>
                  <span className="series-list__name">{seriesLabel(s)}</span>
                  <span className="series-list__meta num">
                    {s.setCount} {s.setCount === 1 ? "set" : "sets"}
                    {s.lastLocalDate ? ` / last ${s.lastLocalDate}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
