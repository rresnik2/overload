// Which screen edge the workout's exercise tab sits on: a per-device convenience kept in localStorage (the pattern of
// components/ui/tips.ts). Every read and write is wrapped in try/catch; a blocked store just means "right".
import { useSyncExternalStore } from "react";

export type ExerciseTabSide = "right" | "left";

export const EXERCISE_TAB_SIDE_KEY = "overload:exercise-tab-side";
const EVENT = "overload:exercise-tab-side-changed";

export function readExerciseTabSide(): ExerciseTabSide {
  try {
    return window.localStorage.getItem(EXERCISE_TAB_SIDE_KEY) === "left" ? "left" : "right";
  } catch {
    return "right";
  }
}

export function setExerciseTabSide(side: ExerciseTabSide) {
  try {
    if (side === "left") window.localStorage.setItem(EXERCISE_TAB_SIDE_KEY, "left");
    else window.localStorage.removeItem(EXERCISE_TAB_SIDE_KEY);
  } catch {
    // storage unavailable (private window, blocked): the tab stays on the right
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The chosen side; "right" on the server and for the first render. Moves live when Settings (or another tab) changes it. */
export function useExerciseTabSide(): ExerciseTabSide {
  return useSyncExternalStore(subscribe, readExerciseTabSide, () => "right");
}
