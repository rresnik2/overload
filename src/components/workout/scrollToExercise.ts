"use client";
import { useEffect, useRef, type RefObject } from "react";

const FALLBACK_GAP_PX = 16;

/** Space kept between the dial and the sticky Log set row once the panel has been scrolled clear. */
const CLEARANCE_PX = 8;

/**
 * How much further than "exercise just under the bar" the page must scroll for the dial to sit fully above the sticky Log set row:
 * on a phone the active-set panel is taller than the screen, and the row (a fixed distance from the bottom edge) would otherwise
 * cover the dial's lower part. `moves` is how far the page is about to scroll anyway; `room` is how far the exercise's top may still
 * rise (to the bar's lower edge: the exercise is never scrolled under the bar).
 */
function extraToClearLogRow(el: HTMLElement, moves: number, room: number): number {
  const face = el.querySelector<HTMLElement>(".dial__face");
  const row = el.querySelector<HTMLElement>(".wk-panel__logrow");
  if (!face || !row) return 0;
  const dial = face.getBoundingClientRect();
  const stickyTop = window.innerHeight - (Number.parseFloat(getComputedStyle(row).bottom) || 0) - row.getBoundingClientRect().height;
  const hangs = dial.bottom - moves + CLEARANCE_PX - stickyTop;
  return Math.max(0, Math.min(hangs, room));
}

/**
 * Bring an exercise's top into view under the sticky workout bar, and far enough that its dial is not under the sticky Log set row.
 * The bar is measured (it grows with the status-bar inset and the font size) and the gap comes from `--space-6`; smooth, or
 * instant under reduced motion.
 */
export function scrollExerciseIntoView(el: HTMLElement) {
  if (typeof el.scrollIntoView !== "function") return;
  const bar = document.querySelector<HTMLElement>(".wk-topbar");
  const gap = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-6")) || FALLBACK_GAP_PX;
  const margin = (bar?.getBoundingClientRect().height ?? 0) + gap;
  const extra = extraToClearLogRow(el, el.getBoundingClientRect().top - margin, margin - (bar?.getBoundingClientRect().bottom ?? 0));
  el.style.scrollMarginTop = `${margin - extra}px`;
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
}

/**
 * When `focused` turns true (tap, exercise tab or auto-advance), scroll the element into view. Not on first render, unless
 * `scrollOnMount`: an exercise the lifter has just added opens its dial panel at the bottom of a tall page, where the sticky Log set
 * row would sit over the dial, so the panel is brought up to the top once it can be shown.
 */
export function useScrollIntoViewOnFocus(ref: RefObject<HTMLElement | null>, focused: boolean, enabled: boolean, scrollOnMount = false) {
  const was = useRef(focused);
  const pending = useRef(scrollOnMount);
  useEffect(() => {
    const before = was.current;
    was.current = focused;
    const el = ref.current;
    if (!enabled || !focused || !el) return;
    if (!before || pending.current) {
      pending.current = false;
      scrollExerciseIntoView(el);
    }
  }, [ref, focused, enabled]);
}
