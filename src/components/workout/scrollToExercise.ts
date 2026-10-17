"use client";
import { useEffect, useRef, type RefObject } from "react";

const FALLBACK_GAP_PX = 16;

/**
 * Bring an exercise's top into view under the sticky workout bar. The bar is measured (it grows with the status-bar inset and the
 * font size) and the gap comes from `--space-6`; smooth, or instant under reduced motion.
 */
export function scrollExerciseIntoView(el: HTMLElement) {
  if (typeof el.scrollIntoView !== "function") return;
  const bar = document.querySelector<HTMLElement>(".wk-topbar");
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-6")) || FALLBACK_GAP_PX;
  el.style.scrollMarginTop = `${(bar?.getBoundingClientRect().height ?? 0) + gap}px`;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

/** When `focused` turns true (tap, exercise tab or auto-advance), scroll the element into view. Not on first render. */
export function useScrollIntoViewOnFocus(ref: RefObject<HTMLElement | null>, focused: boolean, enabled: boolean) {
  const was = useRef(focused);
  useEffect(() => {
    const before = was.current;
    was.current = focused;
    const el = ref.current;
    if (enabled && focused && !before && el) scrollExerciseIntoView(el);
  }, [ref, focused, enabled]);
}
