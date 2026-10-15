import clsx from "clsx";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { ExerciseRow } from "@/contracts/entities";
import { ExerciseCard } from "./ExerciseCard";

/**
 * A grid of ExerciseCards, or an EmptyState when there is nothing to show. Props only.
 * `hrefFor` makes each card a link; `actionsFor` adds per-card controls (the picker).
 */
export interface ExerciseListProps {
  exercises: ExerciseRow[];
  hrefFor?: (exercise: ExerciseRow) => string;
  actionsFor?: (exercise: ExerciseRow) => ReactNode;
  showImages?: boolean;
  /** Shown when `exercises` is empty. */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  className?: string;
}

export function ExerciseList({ exercises, hrefFor, actionsFor, showImages = true, empty, className }: ExerciseListProps) {
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
    <ul className={clsx("exercise-list", className)}>
      {exercises.map((exercise, index) => (
        <li key={exercise.id}>
          <ExerciseCard exercise={exercise} href={hrefFor?.(exercise)} actions={actionsFor?.(exercise)} showImage={showImages} priorityImage={index < 3} />
        </li>
      ))}
    </ul>
  );
}
