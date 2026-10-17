"use client";
import clsx from "clsx";
import { memo, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from "react";
import type { TermId } from "@/lib/glossary";
import { ECHO_MS, STEP_COMMIT_MS, useFlushOnLeave, type CommitHandle } from "./commit";
import { InfoHint } from "./InfoHint";

export interface DialProps {
  /** Accessible name, e.g. "Set 3 weight". */
  label: string;
  /** A glossary term: adds a small "i" (same as NumberStepper.labelHint). */
  labelHint?: TermId;
  /** Every selectable value, ascending. One detent = one index. */
  values: readonly number[];
  /** Selected value, or null when nothing is chosen yet (the dial rests at restIndex). */
  value: number | null;
  /**
   * The value as it turns. Without `onCommit` this fires once per detent and is the only callback (store it). With `onCommit` it is
   * the LIVE value for a readout and a picture: do not write it to storage.
   */
  onChange: (next: number) => void;
  /** Fires once when a turn settles (drag released, 250 ms after the last key or wheel step, blur, page hidden, unmount). Write the value here. */
  onCommit?: (next: number) => void;
  /** Gives the parent `flush()` for committing a pending value early. */
  ref?: Ref<CommitHandle>;
  /** Spoken value: "102.5 kilograms total", "Pin 9, 45 kilograms". */
  valueText: (v: number) => string;
  /** Rim fill and the ink for ticks and stamps on it (token names). Default: primary / primary-content. */
  rim?: string;
  ink?: string;
  /** Short stamp on the plate face under the hub ("KG"). Turns with the plate. */
  stamp?: string;
  /** Where the dial points while value is null. Default 0. */
  restIndex?: number;
  /** Degrees per detent. Default 12. */
  detentDeg?: number;
  disabled?: boolean;
  /** Fired once per detent in the direction turned, for a caller that wants to react to each step (no caller uses it yet). */
  onDetent?: (dir: 1 | -1) => void;
  className?: string;
}

const PAGE_STEPS = 4;
const WHEEL_PX_PER_DETENT = 30;

type Source = "drag" | "step";

/**
 * A token name ("plate-red", "color-primary", "--steel"), a short alias ("primary", "primary-content") or any CSS
 * colour / var() expression becomes a CSS colour. Unknown tokens simply resolve to nothing, so callers see the problem.
 */
function tokenColor(input: string): string {
  const s = input.trim();
  if (/^(var\(|#|rgb|hsl|oklch|oklab|color\()/i.test(s)) return s;
  if (s.startsWith("--")) return `var(${s})`;
  if (/^(primary|secondary|accent|success|error|base-100|base-200|base-300|base-content)(-content)?$/.test(s)) return `var(--color-${s})`;
  return `var(--${s})`;
}

function nearestIndex(values: readonly number[], v: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i]! - v) < Math.abs(values[best]! - v)) best = i;
  return best;
}

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i));
}

function ticksFor(detentDeg: number): { x1: number; y1: number; x2: number; y2: number; major: boolean }[] {
  const n = Math.max(1, Math.round(360 / detentDeg));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((i * 360) / n - 90) * (Math.PI / 180);
    const major = i % 5 === 0;
    const r1 = major ? 78 : 84;
    const r2 = 93;
    out.push({ x1: +(Math.cos(a) * r1).toFixed(2), y1: +(Math.sin(a) * r1).toFixed(2), x2: +(Math.cos(a) * r2).toFixed(2), y2: +(Math.sin(a) * r2).toFixed(2), major });
  }
  return out;
}

/**
 * A plate-face rotary control over a list of values (it does not know about equipment). Dragging turns it with
 * pointer-angle detents (clockwise increases); a visually hidden native range input is the accessibility source of
 * truth (arrow keys, Page Up/Down = 4 steps, Home/End, VoiceOver swipes) and the SVG is decorative. The mouse wheel
 * steps it only while it has focus. At either end extra rotation is discarded and the dial plays a short bump.
 * Drag snaps with no tween; keyboard and wheel steps tween 80 ms; reduced motion turns all of it off (primitives.css).
 *
 * Two ways to use the value. With only `onChange`, every detent reports (and a parent that stores it gets one write per detent).
 * With `onCommit` too, `onChange` is the LIVE value for a readout and a picture, and `onCommit` fires once per turn: on release of
 * a drag, 250 ms after the last key or wheel step, on blur, when the page is hidden and on unmount. The dial keeps its own
 * position until the stored value comes back, so it never snaps back between the release and the write.
 */
export const Dial = memo(function Dial({ label, labelHint, values, value, onChange, onCommit, valueText, rim, ink, stamp, restIndex = 0, detentDeg = 12, disabled, onDetent, className, ref }: DialProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const count = values.length;
  const rest = clampIndex(restIndex, count);
  const propIdx = value === null ? rest : nearestIndex(values, value);
  // What the dial shows while a turn is open, or between its commit and the stored value coming back. `base` is the prop index the
  // turn started from: once the prop moves (the echo, or an outside change) the prop wins again.
  const [turn, setTurn] = useState<{ idx: number; base: number; open: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const idx = turn && (turn.open || turn.base === propIdx) ? turn.idx : propIdx;
  const [tween, setTween] = useState(false);
  const [bump, setBump] = useState<{ dir: 1 | -1; n: number } | null>(null);

  const faceRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const idxRef = useRef(idx);
  const drag = useRef<{ id: number; cx: number; cy: number; last: number; acc: number } | null>(null);
  const wheelAcc = useRef(0);
  const latest = useRef({ count, values, value, onChange, onCommit, onDetent, disabled, propIdx });
  const openRef = useRef(false);
  const pending = useRef<number | null>(null);
  const stepTimer = useRef(0);
  const echoTimer = useRef(0);

  // Indices this dial reported (onChange, or onCommit) that the `value` prop has not echoed yet. The value usually comes back through
  // a store (Dexie), so for a moment the prop is behind idxRef: resetting idxRef from every render would drop quick key presses.
  const reported = useRef<number[]>([]);

  // A layout effect: a timer that fires right after a render must already see that render's prop index.
  useLayoutEffect(() => {
    latest.current = { count, values, value, onChange, onCommit, onDetent, disabled, propIdx };
  });
  useEffect(() => {
    const k = reported.current.indexOf(propIdx);
    if (k >= 0) {
      // An echo of one of our own reports. Newer reports may still be in flight: leave idxRef where it is until the last one lands.
      reported.current.splice(0, k + 1);
      if (reported.current.length === 0 && !openRef.current) idxRef.current = propIdx;
      return;
    }
    reported.current = [];
    // An outside change (sync) must not yank the dial away mid-turn.
    if (!openRef.current) idxRef.current = propIdx;
  }, [propIdx]);

  /** Stop showing the dial's own position once nothing is open and the prop has not followed (a write that failed). */
  function armEcho() {
    window.clearTimeout(echoTimer.current);
    echoTimer.current = window.setTimeout(() => setTurn((t) => (t && !t.open ? null : t)), ECHO_MS);
  }

  /** Close the turn. In commit mode this reports the value once; otherwise the detents already reported themselves. */
  function settle() {
    window.clearTimeout(stepTimer.current);
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
    if (pending.current !== null) settle();
  });
  useImperativeHandle(ref, () => ({ flush: () => pending.current !== null && settle() }));
  // Declared after useFlushOnLeave so it runs after the unmount flush (which may arm a timer).
  useEffect(
    () => () => {
      window.clearTimeout(stepTimer.current);
      window.clearTimeout(echoTimer.current);
    },
    [],
  );

  /** Move by `delta` detents from the current index. Rotation past either end is thrown away and bumps. */
  function moveBy(delta: number, source: Source) {
    const cur = latest.current;
    if (cur.disabled || cur.count === 0 || delta === 0) return;
    const from = idxRef.current;
    const to = clampIndex(from + delta, cur.count);
    const dir: 1 | -1 = delta > 0 ? 1 : -1;
    const moved = Math.abs(to - from);
    if (moved > 0) {
      idxRef.current = to;
      setTween(source === "step");
      const open = Boolean(cur.onCommit) || source === "drag";
      openRef.current = open;
      setTurn({ idx: to, base: cur.propIdx, open });
      window.clearTimeout(echoTimer.current);
      for (let i = 0; i < moved; i++) cur.onDetent?.(dir);
      if (cur.onCommit) {
        pending.current = to;
        window.clearTimeout(stepTimer.current);
        if (source === "step") stepTimer.current = window.setTimeout(settle, STEP_COMMIT_MS);
      } else {
        reported.current.push(to);
        if (source === "step") armEcho();
      }
      cur.onChange(cur.values[to]!);
    }
    if (Math.abs(delta) > moved) setBump((b) => ({ dir, n: (b?.n ?? 0) + 1 }));
  }
  // The wheel listener is attached once, so it calls through a ref to always reach the current closure.
  const moveByRef = useRef(moveBy);
  useEffect(() => {
    moveByRef.current = moveBy;
  });

  useEffect(() => {
    const face = faceRef.current;
    if (!face) return;
    // Native (non-passive) listener: React's onWheel is passive and could not stop the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== rangeRef.current || latest.current.disabled) return;
      e.preventDefault();
      wheelAcc.current -= e.deltaY;
      const k = Math.trunc(wheelAcc.current / WHEEL_PX_PER_DETENT);
      if (k) {
        wheelAcc.current -= k * WHEEL_PX_PER_DETENT;
        moveByRef.current(k, "step");
      }
    };
    face.addEventListener("wheel", onWheel, { passive: false });
    return () => face.removeEventListener("wheel", onWheel);
  }, []);

  const angleOf = (e: { clientX: number; clientY: number }, d: { cx: number; cy: number }) => (Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180) / Math.PI;

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const d = { id: e.pointerId, cx: r.left + r.width / 2, cy: r.top + r.height / 2, last: 0, acc: 0 };
    d.last = angleOf(e, d);
    drag.current = d;
    openRef.current = true;
    window.clearTimeout(stepTimer.current);
    window.clearTimeout(echoTimer.current);
    setTurn({ idx: idxRef.current, base: propIdx, open: true });
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not available (or the pointer is already gone): the drag then ends on pointerup/cancel as usual.
    }
    rangeRef.current?.focus({ preventScroll: true });
    e.preventDefault();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const a = angleOf(e, d);
    let delta = a - d.last;
    if (delta > 180) delta -= 360;
    if (delta <= -180) delta += 360;
    d.last = a;
    d.acc += delta;
    const whole = Math.trunc(d.acc / detentDeg);
    if (whole === 0) return;
    d.acc -= whole * detentDeg;
    const before = idxRef.current;
    moveBy(whole, "drag");
    // Limit: the leftover turn is thrown away so turning back starts from the end, not from a hidden backlog.
    if (clampIndex(before + whole, count) !== before + whole) d.acc = 0;
  }

  function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
    settle(); // the release is the commit
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const last = count - 1;
    const step: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: PAGE_STEPS, PageDown: -PAGE_STEPS, Home: -idxRef.current, End: last - idxRef.current };
    const delta = step[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    if (delta !== 0) moveBy(delta, "step");
    else if (e.key === "Home" || e.key === "End") setBump((b) => ({ dir: e.key === "End" ? 1 : -1, n: (b?.n ?? 0) + 1 }));
  }

  const ticks = useMemo(() => ticksFor(detentDeg), [detentDeg]);
  const spoken = value === null && !turn ? "Not set" : valueText(values[idx]!);
  const style = {
    "--dial-rim": tokenColor(rim ?? "color-primary"),
    "--dial-ink": tokenColor(ink ?? "color-primary-content"),
  } as CSSProperties;
  const shade = `${uid}-shade`;
  const hub = `${uid}-hub`;

  return (
    <div className={clsx("dial", disabled && "dial--disabled", className)} style={style} data-no-swipe>
      {labelHint ? (
        <div className="dial__label-row">
          <span className="dial__label">{label}</span>
          <InfoHint term={labelHint} />
        </div>
      ) : null}
      <input
        ref={rangeRef}
        type="range"
        className="dial__range sr-only"
        aria-label={label}
        aria-valuetext={spoken}
        min={0}
        max={Math.max(0, count - 1)}
        step={1}
        value={idx}
        disabled={disabled}
        aria-disabled={disabled ? true : undefined}
        onKeyDown={onKeyDown}
        onBlur={() => pending.current !== null && settle()}
        // Assistive tech (VoiceOver swipe up/down, TalkBack volume keys) changes the range directly.
        onChange={(e) => moveBy(Number(e.target.value) - idxRef.current, "step")}
      />
      <div
        ref={faceRef}
        className="dial__face"
        data-dragging={dragging ? "true" : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <svg viewBox="-112 -112 224 224" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id={shade} cx="40%" cy="32%" r="80%">
              <stop offset="0" stopColor="#fff" stopOpacity=".22" />
              <stop offset=".6" stopColor="#fff" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity=".3" />
            </radialGradient>
            <radialGradient id={hub} cx="38%" cy="34%" r="75%">
              <stop offset="0" stopColor="#eef0f2" />
              <stop offset="1" stopColor="#8e9399" />
            </radialGradient>
          </defs>
          <circle r="100" cy="7" fill="#000" opacity=".4" />
          <g key={bump?.n ?? 0} className="dial__bump" data-bump={bump ? (bump.dir === 1 ? "up" : "down") : undefined}>
            <g className="dial__rot" data-tween={tween ? "true" : undefined} style={{ transform: `rotate(${idx * detentDeg}deg)` }}>
              <circle className="dial__rim" r="100" />
              <circle r="100" fill={`url(#${shade})`} />
              <g className="dial__ticks">
                {ticks.map((t, i) => (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.major ? 3 : 1.6} />
                ))}
              </g>
              <circle r="70" fill="#000" opacity=".16" />
              <circle r="70" fill="none" stroke="#000" strokeOpacity=".25" strokeWidth="2" />
              <text className="dial__stamp" y="-42" textAnchor="middle" fontSize="13" letterSpacing="3">
                OVERLOAD
              </text>
              {stamp ? (
                <text className="dial__stamp" y="58" textAnchor="middle" fontSize="18" style={{ fontStyle: "italic", fontWeight: 850 }}>
                  {stamp}
                </text>
              ) : null}
              <rect className="dial__mark" x="-3" y="-68" width="6" height="16" rx="3" />
              <circle r="32" fill={`url(#${hub})`} />
              <circle r="12" fill="#121314" />
            </g>
          </g>
          <polygon className="dial__pointer" points="-9,-112 9,-112 0,-96" />
        </svg>
      </div>
    </div>
  );
});
