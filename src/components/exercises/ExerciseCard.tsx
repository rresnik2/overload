import clsx from "clsx";
import Link from "next/link";
import type { ReactNode } from "react";
import { HardCard } from "@/components/primitives/HardCard";
import type { ExerciseRow } from "@/contracts/entities";
import { ExerciseImage } from "./ExerciseImage";
import { ModalityBadge } from "./ModalityBadge";
import { MuscleChips } from "./MuscleChips";

/**
 * One exercise in a list: photo, name, modality tag, muscles. Props only (no data fetching), so the workout picker can reuse it.
 * With `href` the whole card is a link; without it the card is static and `actions` carries the picker's own controls.
 */
export interface ExerciseCardProps {
  exercise: ExerciseRow;
  /** Makes the card a link (library: the detail page). */
  href?: string;
  /** Extra controls rendered under the muscles (the picker's "Add" button). */
  actions?: ReactNode;
  /** Show the first photo. Default true. */
  showImage?: boolean;
  /** Load the photo eagerly (cards above the fold). Default false. */
  priorityImage?: boolean;
  /** Max muscle chips. Default 4. */
  maxMuscles?: number;
  /** Heading level of the exercise name: 2 when the page title is the h1 above the list, 3 (default) under a section heading. */
  headingLevel?: 2 | 3;
  /** Exercise ids the user starred. Props only: the card never reads data; `renderAction` is told whether this exercise is one. */
  favoriteIds?: ReadonlySet<string>;
  /** The star control (FavoriteButton), rendered in the card's top-right corner outside the link. */
  renderAction?: (exercise: ExerciseRow, isFavorite: boolean) => ReactNode;
  className?: string;
}

export function ExerciseCard({ exercise, href, actions, showImage = true, priorityImage = false, maxMuscles = 4, headingLevel = 3, favoriteIds, renderAction, className }: ExerciseCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const image = showImage ? exercise.images[0] : undefined;
  const body = (
    <>
      {image ? (
        <div className="exercise-card__photo">
          <ExerciseImage path={image} alt="" priority={priorityImage} />
        </div>
      ) : null}
      <div className="exercise-card__body">
        <ModalityBadge modality={exercise.modality} equipment={exercise.equipment} />
        <Heading className="exercise-card__name">{exercise.name}</Heading>
        <MuscleChips muscles={exercise.muscles} max={maxMuscles} />
        {exercise.isCustom ? <p className="exercise-card__custom">Your exercise</p> : null}
      </div>
    </>
  );
  return (
    <HardCard as="article" interactive={Boolean(href)} padded={false} className={clsx("exercise-card", renderAction && "exercise-card--starrable", className)} data-exercise-id={exercise.id}>
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
