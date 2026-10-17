"use client";
import clsx from "clsx";
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from "react";
import type { TermId } from "@/lib/glossary";
import { ECHO_MS, STEP_COMMIT_MS, useFlushOnLeave, type CommitHandle } from "./commit";
import { InfoHint } from "./InfoHint";

export interface NumberStripProps {
  label: string;
  labelHint?: TermId;
  values: readonly number[];
  value: number | null;
  /**
   * The value as it moves. Without `onCommit` this fires on every change (store it). With `onCommit` it is the LIVE value for a
   * readout: do not write it to storage.
   */
  onChange: (next: number) => void;
  /** Fires once when the strip settles (scroll ended, drag released, tap, 250 ms after the last key, blur, page hidden, unmount). Write the value here. */
  onCommit?: (next: number) => void;
  /** Gives the parent `flush()` for committing a pending value early. */
  ref?: Ref<CommitHandle>;
  valueText?: (v: number) => string;
  /** Item width in px. Default 46. */
  itemSize?: number;
  disabled?: boolean;
  className?: string;
}

const PAGE_STEPS = 5;
const WHEEL_PX_PER_STEP = 24;
const DRAG_THRESHOLD_PX = 3;
/** A programmatic smooth scroll that never reports its target (interrupted, or no `scrollend`) stops being trusted after this. */
const SETTLE_MS = 600;
/** Without `scrollend` a scroll counts as over this long after its last event; with it, this is only the backstop. */
const SCROLL_QUIET_MS = 150;
const SCROLL_BACKSTOP_MS = 500;

function nearestIndex(values: readonly number[], v: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i]! - v) < Math.abs(values[best]! - v)) best = i;
  return best;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const hasScrollEnd = () => typeof window !== "undefined" && "onscrollend" in window;

/** One number of the strip. Memoized so a change of the selection re-renders two items, not all of them. */
const Item = memo(function Item({ v, i, selected, pick }: { v: number; i: number; selected: boolean; pick: (i: number) => void }) {
  return (
    <div className={clsx("numstrip__item num", selected && "is-sel")} aria-hidden="true" onClick={() => pick(i)}>
      {v}
    </div>
  );
});

/**
 * A horizontal strip of integers (reps). Touch uses native scroll-snap scrolling, a mouse drags it, the arrow keys
 * step it (Page Up/Down = 5, Home/End jump), and a vertical mouse wheel steps it while it has focus. The centred
 * item is the value; it re-centres when `value` changes from outside and when the strip is resized.
 * `value: null` leaves the first item centred with nothing selected until the lifter picks one.
 *
 * With `onCommit` the strip reports the value live through `onChange` while it scrolls and commits once when it settles; it keeps
 * showing its own position until the stored value comes back.
 */
export const NumberStrip = memo(function NumberStrip({ label, labelHint, values, value, onChange, onCommit, ref, valueText, itemSize = 46, disabled, className }: NumberStripProps) {
  const scRef = useRef<HTMLDivElement>(null);
  const count = values.length;
  const propIdx = value === null ? -1 : nearestIndex(values, value);
  // What the strip shows while a change is open or waiting for its stored value (see Dial for the same idea).
  const [turn, setTurn] = useState<{ idx: number; base: number; open: boolean } | null>(null);
  const idx = turn && (turn.open || turn.base === propIdx) ? turn.idx : propIdx;
  const text = (v: number) => (valueText ? valueText(v) : String(v));

  // Index of the last value this component reported or centred on. A `value` prop that disagrees came from outside.
  const idxRef = useRef(propIdx);
  // Indices reported (onChange, or onCommit) that the `value` prop has not echoed yet (the value usually round-trips through a store).
  // An echo of an older report must not be mistaken for an outside change while newer presses are in flight.
  const reported = useRef<number[]>([]);
  // Set while a programmatic smooth scroll is heading for this index; scroll events on the way must not report values.
  const heading = useRef<{ to: number; timer: number } | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const wheelAcc = useRef(0);
  const openRef = useRef(false);
  const pending = useRef<number | null>(null);
  const commitTimer = useRef(0);
  const echoTimer = useRef(0);
  const latest = useRef({ values, onChange, onCommit, disabled, itemSize, count, propIdx });
  // A layout effect: a timer that fires right after a render must already see that render's prop index.
  useLayoutEffect(() => {
    latest.current = { values, onChange, onCommit, disabled, itemSize, count, propIdx };
  });

  const centre = (i: number) => {
    const sc = scRef.current;
    if (sc) sc.scrollLeft = Math.max(0, i) * itemSize;
  };

  function settleHeading() {
    if (heading.current) window.clearTimeout(heading.current.timer);
    heading.current = null;
  }

  function armEcho() {
    window.clearTimeout(echoTimer.current);
    echoTimer.current = window.setTimeout(() => setTurn((t) => (t && !t.open ? null : t)), ECHO_MS);
  }

  /** Close the change. In commit mode this reports the value once; otherwise every change already reported itself. */
  function commit() {
    window.clearTimeout(commitTimer.current);
    const cur = latest.current;
    openRef.current = false;
    setTurn((t) => (t ? { ...t, open: false, base: cur.propIdx } : t));
    armEcho();
    const to = pending.current;
    if (to === null) return;
    pending.current = null;
    if (to !== cur.propIdx) reported.current.push(to);
    cur.onCommit?.(cur.values[to]!);
  }
  useFlushOnLeave(() => {
    if (pending.current !== null) commit();
  });
  useImperativeHandle(ref, () => ({ flush: () => pending.current !== null && commit() }));
  useEffect(
    () => () => {
      window.clearTimeout(commitTimer.current);
      window.clearTimeout(echoTimer.current);
    },
    [],
  );

  /** A new index to report: show it now, tell the parent live, and arrange the commit (`when`: at once, after a pause, or later by scrollend). */
  function report(to: number, when: "now" | "soon" | "scroll") {
    const cur = latest.current;
    idxRef.current = to;
    const open = Boolean(cur.onCommit) && when !== "now";
    openRef.current = open;
    setTurn({ idx: to, base: cur.propIdx, open });
    window.clearTimeout(echoTimer.current);
    if (cur.onCommit) {
      pending.current = to;
      window.clearTimeout(commitTimer.current);
      if (when === "soon") commitTimer.current = window.setTimeout(commit, STEP_COMMIT_MS);
      else if (when === "scroll") commitTimer.current = window.setTimeout(commit, hasScrollEnd() ? SCROLL_BACKSTOP_MS : SCROLL_QUIET_MS);
    } else {
      reported.current.push(to);
      armEcho();
    }
    cur.onChange(cur.values[to]!);
    if (cur.onCommit && when === "now") commit();
  }

  /** Choose index `i`: report it now, then bring it to the centre (smoothly unless motion is reduced). */
  function select(i: number, smooth: boolean, when: "now" | "soon" = "soon") {
    const cur = latest.current;
    if (cur.disabled || cur.count === 0) return;
    const to = Math.max(0, Math.min(cur.count - 1, i));
    const sc = scRef.current;
    if (to !== idxRef.current) report(to, when);
    else if (when === "now" && pending.current !== null) commit();
    if (!sc) return;
    const left = to * cur.itemSize;
    if (smooth && !reducedMotion() && typeof sc.scrollTo === "function") {
      settleHeading();
      heading.current = { to, timer: window.setTimeout(settleHeading, SETTLE_MS) };
      sc.scrollTo({ left, behavior: "smooth" });
    } else {
      settleHeading();
      sc.scrollLeft = left;
    }
  }
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });

  // Re-centre when the value changed from outside (not an echo of what this strip just reported).
  useLayoutEffect(() => {
    const k = reported.current.indexOf(propIdx);
    if (k >= 0) {
      reported.current.splice(0, k + 1);
      return;
    }
    if (propIdx === idxRef.current) return;
    reported.current = [];
    // An outside change (sync) must not yank the strip away mid-gesture; the gesture's own commit overwrites it.
    if (openRef.current) return;
    idxRef.current = propIdx;
    if (!drag.current?.moved) {
      settleHeading();
      centre(propIdx);
    }
    // `centre` only reads refs and `itemSize`; the effect is keyed to the value on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propIdx]);

  // First paint (and item size changes): centre without animation.
  useLayoutEffect(() => {
    centre(idxRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSize, count]);

  // The side padding is a percentage of the strip's width, so a resize shifts the centre: put the value back.
  useEffect(() => {
    const sc = scRef.current;
    if (!sc || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!drag.current?.moved && !heading.current) centre(idxRef.current);
    });
    ro.observe(sc);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSize]);

  useEffect(() => {
    const sc = scRef.current;
    if (!sc) return;
    // Native (non-passive) so a focused strip can turn a vertical wheel into steps without scrolling the page.
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== sc || latest.current.disabled || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      wheelAcc.current += e.deltaY;
      const n = Math.trunc(wheelAcc.current / WHEEL_PX_PER_STEP);
      if (n) {
        wheelAcc.current -= n * WHEEL_PX_PER_STEP;
        selectRef.current(idxRef.current + n, false);
      }
    };
    // The scroll is over (finger lifted and the snap finished): commit what it landed on.
    const onScrollEnd = () => {
      const h = heading.current;
      if (h) {
        // A browser delivers `scrollend` a moment AFTER an animation stops. When a key press has already started the next scroll, that
        // late event is not the end of the scroll we are heading for: settling now would let the next scroll event, still on the
        // previous item, be read as the lifter scrolling back, and the press would be undone. Keep heading; the target's own
        // scroll event, the `SETTLE_MS` backstop or the next `scrollend` settles it.
        const { itemSize, count } = latest.current;
        const near = Math.max(0, Math.min(count - 1, Math.round(sc.scrollLeft / itemSize)));
        if (near !== h.to) return;
        settleHeading();
      }
      if (pending.current !== null) commit();
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    sc.addEventListener("scrollend", onScrollEnd);
    return () => {
      sc.removeEventListener("wheel", onWheel);
      sc.removeEventListener("scrollend", onScrollEnd);
      settleHeading();
    };
    // `commit` reads only refs and the latest-props ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native scrolling (touch flicks, trackpads): the centred item is the value.
  const rafRef = useRef(0);
  function onScroll() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const sc = scRef.current;
      if (!sc || latest.current.disabled) return;
      const near = Math.max(0, Math.min(latest.current.count - 1, Math.round(sc.scrollLeft / latest.current.itemSize)));
      const h = heading.current;
      if (h) {
        if (near === h.to) settleHeading();
        return;
      }
      if (near !== idxRef.current) report(near, "scroll");
      else if (pending.current !== null) {
        // Still moving but on the same item: push the quiet-period commit back.
        window.clearTimeout(commitTimer.current);
        commitTimer.current = window.setTimeout(commit, hasScrollEnd() ? SCROLL_BACKSTOP_MS : SCROLL_QUIET_MS);
      }
    });
  }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const base = idxRef.current;
    const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: PAGE_STEPS, PageDown: -PAGE_STEPS };
    let to: number | null = null;
    if (e.key in steps) to = base + steps[e.key]!;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = count - 1;
    if (to === null) return;
    e.preventDefault();
    select(to, true);
  }

  // Mouse drag. Touch and pen use native scrolling; capture starts only after a few pixels so plain clicks still reach the items.
  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    settleHeading();
    if (disabled || e.pointerType !== "mouse" || e.button !== 0) return;
    drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false, id: e.pointerId };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const sc = e.currentTarget;
    if (!d.moved && Math.abs(dx) > DRAG_THRESHOLD_PX) {
      d.moved = true;
      sc.style.scrollSnapType = "none";
      sc.dataset.dragging = "true";
      try {
        sc.setPointerCapture(e.pointerId);
      } catch {
        // Capture unavailable: the drag still follows moves over the strip.
      }
    }
    if (d.moved) sc.scrollLeft = d.left - dx;
  }
  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const sc = e.currentTarget;
    delete sc.dataset.dragging;
    if (!d.moved) return;
    sc.style.scrollSnapType = "";
    // The click that follows a drag must not also select the item under the cursor.
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 60);
    select(Math.round(sc.scrollLeft / itemSize), true, "now"); // the release is the commit
  }

  // Tapping an item commits at once. Stable, so the memoized items do not re-render for it.
  const pick = useCallback((i: number) => {
    if (!suppressClick.current) selectRef.current(i, true, "now");
  }, []);

  const hintRow = labelHint ? (
    <div className="numstrip__label-row">
      <span className="numstrip__label">{label}</span>
      <InfoHint term={labelHint} />
    </div>
  ) : null;

  return (
    <div data-no-swipe className={clsx("numstrip", disabled && "numstrip--disabled", className)} style={{ "--numstrip-size": `${itemSize}px` } as CSSProperties}>
      {hintRow}
      <div className="numstrip__window">
        <div
          ref={scRef}
          className="numstrip__scroller"
          role="spinbutton"
          aria-label={label}
          aria-valuemin={values[0]}
          aria-valuemax={values[count - 1]}
          aria-valuenow={idx < 0 ? undefined : values[idx]}
          aria-valuetext={idx < 0 ? "Not set" : text(values[idx]!)}
          aria-disabled={disabled ? true : undefined}
          tabIndex={disabled ? -1 : 0}
          // A disabled strip is not focusable, so it must not be a scrollable region either (axe scrollable-region-focusable).
          style={disabled ? { overflowX: "hidden" } : undefined}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          onBlur={() => pending.current !== null && commit()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={settleHeading}
        >
          <div className="numstrip__pad" aria-hidden="true" />
          {values.map((v, i) => (
            <Item key={v} v={v} i={i} selected={i === idx} pick={pick} />
          ))}
          <div className="numstrip__pad" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
});
