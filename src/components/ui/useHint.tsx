"use client";
// The behaviour shared by InfoHint and Term: when the popover is open, where it sits, and how it closes.
//   fine pointer (hover: hover):  opens on hover and on keyboard focus; click pins it open
//   touch:                        opens on tap; tap again, tap outside or Escape closes it
// The popover is rendered inline (right after the trigger, so assistive tech reads it in order) as a `popover="manual"`
// element: the top layer keeps it above cards and sheets, free of overflow clipping, and positioned against the viewport.
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, PointerEvent, RefObject } from "react";
import { GLOSSARY, type TermId } from "@/lib/glossary";

const FINE_HOVER = "(hover: hover) and (pointer: fine)";
const GAP = 8;
const EDGE = 8;
const LEAVE_DELAY_MS = 150;

const finePointer = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(FINE_HOVER).matches;

/** The Popover API (top layer). Without it the popover is a plain fixed-position element, which works too. */
const supportsPopover = () => typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover === "function";

function focusIsVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true; // no :focus-visible support: treat focus as keyboard focus
  }
}

interface Placement {
  top: number;
  left: number;
  side: "above" | "below";
}

export interface HintApi {
  open: boolean;
  pinned: boolean;
  popoverId: string;
  wrapperRef: RefObject<HTMLSpanElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** Spread on the trigger button. */
  triggerProps: {
    ref: RefObject<HTMLButtonElement | null>;
    type: "button";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    "aria-describedby": string | undefined;
    onClick: () => void;
    onPointerEnter: (e: PointerEvent) => void;
    onPointerLeave: (e: PointerEvent) => void;
    onFocus: (e: FocusEvent<HTMLButtonElement>) => void;
  };
  /** Spread on the wrapper element that contains the trigger and the popover. */
  wrapperProps: { ref: RefObject<HTMLSpanElement | null>; onBlur: (e: FocusEvent<HTMLSpanElement>) => void };
  popover: React.ReactNode;
}

export function useHint(id: TermId): HintApi {
  const entry = GLOSSARY[id];
  const popoverId = `hint-${useId()}`;
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const open = hover || focus || pinned;

  const closeAll = useCallback(() => {
    clearTimeout(leaveTimer.current);
    setHover(false);
    setFocus(false);
    setPinned(false);
  }, []);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const pop = popoverRef.current;
    if (!trigger || !pop) return;
    const b = trigger.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const fitsBelow = b.bottom + GAP + p.height <= vh - EDGE;
    const fitsAbove = b.top - GAP - p.height >= EDGE;
    const side = fitsBelow || !fitsAbove ? "below" : "above";
    const top = side === "below" ? b.bottom + GAP : b.top - GAP - p.height;
    const left = Math.max(EDGE, Math.min(b.left + b.width / 2 - p.width / 2, vw - p.width - EDGE));
    setPlacement({ top: Math.round(top), left: Math.round(left), side });
  }, []);

  // Show in the top layer and measure before paint, so the popover never flashes in the wrong place.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const pop = popoverRef.current;
    try {
      pop?.showPopover?.();
    } catch {
      // already open or unsupported: the fixed-position fallback still works
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: globalThis.PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) closeAll();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const hadFocus = wrapperRef.current?.contains(document.activeElement);
      closeAll();
      if (hadFocus) triggerRef.current?.focus({ preventScroll: true });
    };
    const onMove = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const b = trigger.getBoundingClientRect();
      if (b.bottom < 0 || b.top > window.innerHeight) closeAll();
      else place();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [open, closeAll, place]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const enter = (e: PointerEvent) => {
    if ((e.pointerType !== "mouse" && e.pointerType !== "pen") || !finePointer()) return;
    clearTimeout(leaveTimer.current);
    setHover(true);
  };
  const leave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setHover(false), LEAVE_DELAY_MS);
  };

  const popover = open ? (
    <span
      ref={popoverRef}
      id={popoverId}
      popover={supportsPopover() ? "manual" : undefined}
      // hover/focus only: a tooltip; opened by tap or click: a non-modal disclosure
      role={pinned ? "group" : "tooltip"}
      aria-label={pinned ? entry.term : undefined}
      tabIndex={-1}
      className="hint-pop"
      data-side={placement?.side}
      data-pinned={pinned || undefined}
      style={
        {
          top: placement?.top ?? 0,
          left: placement?.left ?? 0,
          visibility: placement ? "visible" : "hidden",
        } satisfies CSSProperties
      }
      onPointerEnter={enter}
      onPointerLeave={leave}
    >
      <span className="hint-pop__term">{entry.term}</span>
      <span className="hint-pop__text">{entry.short}</span>
      {entry.learn ? (
        <Link href={`/learn/${entry.learn}`} className="hint-pop__learn">
          Learn more
        </Link>
      ) : null}
    </span>
  ) : null;

  return {
    open,
    pinned,
    popoverId,
    wrapperRef,
    triggerRef,
    triggerProps: {
      ref: triggerRef,
      type: "button",
      "aria-expanded": open,
      "aria-controls": open ? popoverId : undefined,
      "aria-describedby": open && !pinned ? popoverId : undefined,
      onClick: () => (pinned ? closeAll() : setPinned(true)),
      onPointerEnter: enter,
      onPointerLeave: leave,
      onFocus: (e) => {
        if (focusIsVisible(e.currentTarget)) setFocus(true);
      },
    },
    wrapperProps: {
      ref: wrapperRef,
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeAll();
      },
    },
    popover,
  };
}
