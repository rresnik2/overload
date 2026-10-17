import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { EquipmentArt } from "@/components/workout/equipment/EquipmentArt";
import { HardCard } from "@/components/primitives/HardCard";
import type { ExerciseRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import type { LocalDate } from "@/lib/dates";
import { lastLoadText, lastLoadUnit, lastLoadWeight, type LastLoad } from "@/lib/analytics/last-load";
import { fromKg } from "@/lib/units";
import { LOAD_TYPE_LABEL, MUSCLE_LABEL } from "./labels";
import { ModalityBadge } from "./ModalityBadge";

/**
 * One exercise in a list, as a compact row: the equipment drawing, the modality tag, the name and one line under it, which
 * is the lifter's last load when there is one and the muscles otherwise. Photos live on the exercise page. Props only (no data
 * fetching), so the workout picker can reuse it. With `href` the whole row is a link; without it `actions` carries the
 * picker's own controls.
 */
export interface ExerciseCardProps {
  exercise: ExerciseRow;
  /** Makes the row a link (library: the detail page). */
  href?: string;
  /** Extra controls at the end of the row (the picker's "Add" button). */
  actions?: ReactNode;
  /** Show the equipment drawing. Default true. */
  showImage?: boolean;
  /** Max muscles named. Default 3. */
  maxMuscles?: number;
  /** Heading level of the exercise name: 2 when the page title is the h1 above the list, 3 (default) under a section heading. */
  headingLevel?: 2 | 3;
  /** Exercise ids the user starred. Props only: the card never reads data; `renderAction` is told whether this exercise is one. */
  favoriteIds?: ReadonlySet<string>;
  /** The star control (FavoriteButton), rendered in the row's corner outside the link. */
  renderAction?: (exercise: ExerciseRow, isFavorite: boolean) => ReactNode;
  /** The lifter's last load on this exercise: the drawing is loaded with it and the line under the name says it. */
  lastLoad?: LastLoad | null;
  unit?: WeightUnit;
  /** For "today" / "yesterday" in the last-load line. */
  today?: LocalDate | null;
  className?: string;
}

function musclesLine(exercise: ExerciseRow, max: number): string {
  const ordered = [...exercise.muscles].sort((a, b) => Number(b.role === "PRIMARY") - Number(a.role === "PRIMARY"));
  return ordered
    .slice(0, max)
    .map((m) => MUSCLE_LABEL[m.muscle])
    .join(" · ");
}

export function ExerciseCard({ exercise, href, actions, showImage = true, maxMuscles = 3, headingLevel = 3, favoriteIds, renderAction, lastLoad = null, unit = "KG", today = null, className }: ExerciseCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const notable = exercise.loadType !== "TOTAL" && exercise.loadType !== "NONE";
  const meta = lastLoad ? lastLoadText(lastLoad, exercise.loadType, unit, today) : musclesLine(exercise, maxMuscles);
  const drawUnit = lastLoad ? lastLoadUnit(lastLoad, unit) : unit;
  const body = (
    <>
      {showImage ? (
        <EquipmentArt
          exercise={exercise}
          unit={drawUnit}
          load={lastLoad ? lastLoadWeight(lastLoad, drawUnit) : null}
          step={lastLoad?.pinStepKg != null ? fromKg(lastLoad.pinStepKg, drawUnit) : null}
          className="exercise-card__art"
        />
      ) : null}
      <div className="exercise-card__body">
        <ModalityBadge modality={exercise.modality} equipment={exercise.equipment} />
        <Heading className="exercise-card__name">{exercise.name}</Heading>
        {meta ? <p className={clsx("exercise-card__meta", lastLoad && "exercise-card__meta--last num")}>{meta}</p> : null}
        {!lastLoad && notable ? <p className="exercise-card__load">Weight: {LOAD_TYPE_LABEL[exercise.loadType].toLowerCase()}</p> : null}
        {exercise.isCustom ? <p className="exercise-card__custom">Your exercise</p> : null}
      </div>
    </>
  );
  return (
    <HardCard
      as="article"
      interactive={Boolean(href)}
      padded={false}
      className={clsx("exercise-card", renderAction && "exercise-card--starrable", actions != null && "exercise-card--actions", className)}
      data-exercise-id={exercise.id}
    >
      {renderAction ? <div className="exercise-card__star">{renderAction(exercise, favoriteIds?.has(exercise.id) ?? false)}</div> : null}
      {href ? (
        <Link href={href} className="exercise-card__link">
          {body}
        </Link>
      ) : (
        <div className="exercise-card__link">{body}</div>
      )}
      {actions ? <div className="exercise-card__actions">{actions}</div> : null}
    </HardCard>
  );
}
