"use client";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { classifyIntent, resolveSwipe } from "./swipe-logic";
import type { SwipeDirection } from "./swipe-logic";

export interface UseSwipeOptions {
  /** Default true. */
  enabled?: boolean;
  /** Directions that may commit (default both). A drag the other way cancels. */
  directions?: readonly SwipeDirection[];
  /** Extra start test, e.g. the left-edge zone. Return false to ignore the gesture. */
  startFilter?: (e: PointerEvent) => boolean;
  /** Horizontal intent is confirmed and the finger is moving: dx is the distance from where it landed. */
  onMove?: (dx: number) => void;
  /** A release that crossed the threshold. */
  onSwipe?: (direction: SwipeDirection) => void;
  /** Once, when a confirmed horizontal gesture finishes; `direction` is null when it was too short or was cancelled. */
  onEnd?: (direction: SwipeDirection | null) => void;
}

const FIELD = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

/** True when a gesture that starts on `target` belongs to something else: opt-outs, form fields, or content that scrolls sideways. */
export function startsInNoSwipeZone(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-no-swipe]") || target.closest(FIELD)) return true;
  for (let el: Element | null = target; el; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth) continue;
    const overflowX = getComputedStyle(el).overflowX;
    if (overflowX === "auto" || overflowX === "scroll") return true;
  }
  return false;
}

interface Track {
  id: number;
  x: number;
  y: number;
  t: number;
  active: boolean;
  dx: number;
  dy: number;
}

/**
 * Horizontal swipes by pointer events, touch and pen only (a mouse never swipes). It reports horizontal intent and nothing else: it
 * never calls preventDefault, so vertical scrolls, taps and text selection stay the browser's. Give the element
 * `touch-action: pan-y pinch-zoom` so the browser leaves horizontal drags to us. Starts inside `[data-no-swipe]`, form fields and
 * sideways-scrolling elements are ignored. The gesture itself does not animate, so reduced motion is the caller's concern.
 */
export function useSwipe<T extends HTMLElement>(ref: RefObject<T | null>, options: UseSwipeOptions) {
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options; // the latest callbacks, without re-binding the listeners
  });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let track: Track | null = null;
    let clearSwallow: (() => void) | null = null;

    const allowed = (dx: number) => {
      const dirs = opts.current.directions;
      return !dirs || dirs.includes(dx < 0 ? "left" : "right");
    };

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    const stop = (direction: SwipeDirection | null) => {
      const t = track;
      track = null;
      detach();
      if (!t?.active) return;
      // A swipe that began on a button or link must not also click it when the finger lifts.
      clearSwallow?.();
      const swallow = (ev: Event) => ev.stopPropagation();
      const timer = window.setTimeout(() => clearSwallow?.(), 350);
      clearSwallow = () => {
        window.removeEventListener("click", swallow, true);
        window.clearTimeout(timer);
        clearSwallow = null;
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      if (direction) opts.current.onSwipe?.(direction);
      opts.current.onEnd?.(direction);
    };

    function onMove(e: PointerEvent) {
      if (!track || e.pointerId !== track.id) return;
      track.dx = e.clientX - track.x;
      track.dy = e.clientY - track.y;
      if (!track.active) {
        const intent = classifyIntent(track.dx, track.dy);
        if (intent === "vertical") return stop(null);
        if (intent !== "horizontal") return;
        if (!allowed(track.dx)) return stop(null);
        track.active = true;
      }
      opts.current.onMove?.(track.dx);
    }

    function onUp(e: PointerEvent) {
      if (!track || e.pointerId !== track.id) return;
      const direction = resolveSwipe(track.dx, track.dy, performance.now() - track.t);
      stop(direction && allowed(track.dx) ? direction : null);
    }

    function onCancel(e: PointerEvent) {
      if (track && e.pointerId === track.id) stop(null);
    }

    function onDown(e: PointerEvent) {
      clearSwallow?.(); // a new touch is a new gesture
      if (track) return stop(null); // a second finger: not a swipe
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (!e.isPrimary || opts.current.startFilter?.(e) === false) return;
      if (startsInNoSwipeZone(e.target)) return;
      track = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), active: false, dx: 0, dy: 0 };
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onCancel, { passive: true });
    }

    el.addEventListener("pointerdown", onDown, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      clearSwallow?.();
      track = null;
      detach();
    };
  }, [ref, enabled]);
}
