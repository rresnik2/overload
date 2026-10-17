import clsx from "clsx";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { ExerciseRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import type { LocalDate } from "@/lib/dates";
import type { LastLoad } from "@/lib/analytics/last-load";
import { ExerciseCard } from "./ExerciseCard";

/**
 * A list of ExerciseCard rows, or an EmptyState when there is nothing to show. Props only.
 * `hrefFor` makes each card a link; `actionsFor` adds per-card controls (the picker).
 */
export interface ExerciseListProps {
  exercises: ExerciseRow[];
  hrefFor?: (exercise: ExerciseRow) => string;
  actionsFor?: (exercise: ExerciseRow) => ReactNode;
  showImages?: boolean;
  /** Shown when `exercises` is empty. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  /** Heading level of each card name (see ExerciseCard). */
  headingLevel?: 2 | 3;
  /** Starred exercise ids and the star control for each card (see ExerciseCard). */
  favoriteIds?: ReadonlySet<string>;
  renderAction?: (exercise: ExerciseRow, isFavorite: boolean) => ReactNode;
  /** The lifter's last load per exercise id (see ExerciseCard). */
  lastLoads?: ReadonlyMap<string, LastLoad>;
  unit?: WeightUnit;
  today?: LocalDate | null;
  /** Names the list (two lists on one page). */
  label?: string;
  className?: string;
}

export function ExerciseList({ exercises, hrefFor, actionsFor, showImages = true, empty, headingLevel, favoriteIds, renderAction, lastLoads, unit, today, label, className }: ExerciseListProps) {
  if (exercises.length === 0) {
    return (
      <EmptyState
        title={empty?.title ?? "No exercises found"}
        description={empty?.description ?? "Try a different search or clear a filter."}
        action={empty?.action}
      />
    );
  }
  return (
    <ul className={clsx("exercise-list", className)} aria-label={label}>
      {exercises.map((exercise) => (
        <li key={exercise.id}>
          <ExerciseCard
            exercise={exercise}
            href={hrefFor?.(exercise)}
            actions={actionsFor?.(exercise)}
            showImage={showImages}
            headingLevel={headingLevel}
            favoriteIds={favoriteIds}
            renderAction={renderAction}
            lastLoad={lastLoads?.get(exercise.id) ?? null}
            unit={unit}
            today={today}
          />
        </li>
      ))}
    </ul>
  );
}
