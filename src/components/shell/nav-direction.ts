"use client";
import { useSyncExternalStore } from "react";
import type { NavTransition } from "./nav";

/**
 * The direction of the navigation that is about to happen, announced by whatever starts it (a dock tap, a swipe, a history
 * traversal) a moment before it commits. `transitionTypes` is the official route to a directional slide, but React hands the types
 * to the first commit that follows, and a route that renders in two steps (its shell, then its data) can use them up on the first.
 * Announcing the direction as well lets PageTransition re-render with the matching slide classes *before* the navigation commits, so
 * the old page's exit and the new page's enter both pick them up whichever commit carries the swap.
 */
let current: NavTransition | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function announceDirection(direction: NavTransition) {
  current = direction;
  clearTimeout(timer);
  timer = setTimeout(clearDirection, 6000); // a navigation that never happens (same tab) must not leave a stale slide behind; a slow server must not lose it
  emit();
}

export function clearDirection() {
  clearTimeout(timer);
  if (current === null) return;
  current = null;
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function useAnnouncedDirection(): NavTransition | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
