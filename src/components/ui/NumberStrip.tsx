"use client";
import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { TermId } from "@/lib/glossary";
import { InfoHint } from "./InfoHint";

export interface NumberStripProps {
  label: string;
  labelHint?: TermId;
  values: readonly number[];
  value: number | null;
  onChange: (next: number) => void;
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

function nearestIndex(values: readonly number[], v: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i]! - v) < Math.abs(values[best]! - v)) best = i;
  return best;
}

const reducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A horizontal strip of integers (reps). Touch uses native scroll-snap scrolling, a mouse drags it, the arrow keys
 * step it (Page Up/Down = 5, Home/End jump), and a vertical mouse wheel steps it while it has focus. The centred
 * item is the value; it re-centres when `value` changes from outside and when the strip is resized.
 * `value: null` leaves the first item centred with nothing selected until the lifter picks one.
 */
export function NumberStrip({ label, labelHint, values, value, onChange, valueText, itemSize = 46, disabled, className }: NumberStripProps) {
  const scRef = useRef<HTMLDivElement>(null);
  const count = values.length;
  const idx = value === null ? -1 : nearestIndex(values, value);
  const text = (v: number) => (valueText ? valueText(v) : String(v));

  // Index of the last value this component reported or centred on. A `value` prop that disagrees came from outside.
  const idxRef = useRef(idx);
  // Set while a programmatic smooth scroll is heading for this index; scroll events on the way must not report values.
  const heading = useRef<{ to: number; timer: number } | null>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const wheelAcc = useRef(0);
  const latest = useRef({ values, onChange, disabled, itemSize, count });
  useEffect(() => {
    latest.current = { values, onChange, disabled, itemSize, count };
  });

  const centre = (i: number) => {
    const sc = scRef.current;
    if (sc) sc.scrollLeft = Math.max(0, i) * itemSize;
  };

  function settle() {
    if (heading.current) window.clearTimeout(heading.current.timer);
    heading.current = null;
  }

  /** Choose index `i`: report it now, then bring it to the centre (smoothly unless motion is reduced). */
  function select(i: number, smooth: boolean) {
    const cur = latest.current;
    if (cur.disabled || cur.count === 0) return;
    const to = Math.max(0, Math.min(cur.count - 1, i));
    const sc = scRef.current;
    if (to !== idxRef.current) {
      idxRef.current = to;
      cur.onChange(cur.values[to]!);
    }
    if (!sc) return;
    const left = to * cur.itemSize;
    if (smooth && !reducedMotion() && typeof sc.scrollTo === "function") {
      settle();
      heading.current = { to, timer: window.setTimeout(settle, SETTLE_MS) };
      sc.scrollTo({ left, behavior: "smooth" });
    } else {
      settle();
      sc.scrollLeft = left;
    }
  }
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  });

  // Re-centre when the value changed from outside (not an echo of what this strip just reported).
  useLayoutEffect(() => {
    if (idx === idxRef.current) return;
    idxRef.current = idx;
    if (!drag.current?.moved) {
      settle();
      centre(idx);
    }
    // `centre` only reads refs and `itemSize`; the effect is keyed to the value on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

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
    sc.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      sc.removeEventListener("wheel", onWheel);
      settle();
    };
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
        if (near === h.to) settle();
        return;
      }
      if (near !== idxRef.current) {
        idxRef.current = near;
        latest.current.onChange(latest.current.values[near]!);
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
    settle();
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
    select(Math.round(sc.scrollLeft / itemSize), true);
  }

  const hintRow = labelHint ? (
    <div className="numstrip__label-row">
      <span className="numstrip__label">{label}</span>
      <InfoHint term={labelHint} />
    </div>
  ) : null;

  return (
    <div className={clsx("numstrip", disabled && "numstrip--disabled", className)} style={{ "--numstrip-size": `${itemSize}px` } as CSSProperties}>
      {hintRow}
      <div className="numstrip__window">
        <div
          ref={scRef}
          className="numstrip__scroller"
          role="spinbutton"
          aria-label={label}
          aria-valuemin={values[0]}
          aria-valuemax={values[count - 1]}
          aria-valuenow={value === null ? undefined : values[idx]}
          aria-valuetext={value === null ? "Not set" : text(values[idx]!)}
          aria-disabled={disabled ? true : undefined}
          tabIndex={disabled ? -1 : 0}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onTouchStart={settle}
        >
          <div className="numstrip__pad" aria-hidden="true" />
          {values.map((v, i) => (
            <div
              key={v}
              className={clsx("numstrip__item num", i === idx && "is-sel")}
              aria-hidden="true"
              onClick={() => {
                if (!suppressClick.current) select(i, true);
              }}
            >
              {v}
            </div>
          ))}
          <div className="numstrip__pad" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
