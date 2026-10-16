"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ExerciseSwitcherProps {
  /** Exercise names in workout order. */
  names: readonly string[];
  /** Index of the focused exercise, or -1 when none is (every exercise is done). */
  index: number;
  onGo: (index: number) => void;
}

/**
 * "‹ Prev · 2 of 5 · Next ›": the visible, accessible path for the swipe between exercises on a phone. The buttons name the exercise
 * they go to and are disabled at the ends (no wrap-around).
 */
export function ExerciseSwitcher({ names, index, onGo }: ExerciseSwitcherProps) {
  const prev = index > 0 ? index - 1 : index === -1 ? names.length - 1 : -1;
  const next = index >= 0 && index < names.length - 1 ? index + 1 : -1;
  return (
    <nav className="wk-switcher" aria-label="Switch exercise" data-no-swipe>
      <button type="button" className="wk-switcher__btn" disabled={prev < 0} aria-label={prev >= 0 ? `Previous exercise: ${names[prev]}` : "Previous exercise"} onClick={() => onGo(prev)}>
        <ChevronLeft size={18} aria-hidden="true" />
        <span>Prev</span>
      </button>
      <p className="wk-switcher__count num" aria-live="polite" aria-atomic="true">
        {index >= 0 ? `${index + 1} of ${names.length}` : `${names.length} exercises`}
      </p>
      <button type="button" className="wk-switcher__btn" disabled={next < 0} aria-label={next >= 0 ? `Next exercise: ${names[next]}` : "Next exercise"} onClick={() => onGo(next)}>
        <span>Next</span>
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </nav>
  );
}
