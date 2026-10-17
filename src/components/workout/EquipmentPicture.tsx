"use client";
import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { BarShape } from "@/components/workout/equipment/art";
import { BarArt, DumbbellArt, HornArt, KettlebellArt, STACK_PITCH, StackPlates } from "@/components/workout/equipment/drawings";
import type { LoadType, WeightUnit } from "@/contracts/enums";
import { STACK_WINDOW, pinOf, stackFirstPlate, type DialSetup, type PictureKind } from "./dial-setup";
import { PANEL_COPY } from "./labels";
import { kettlebellStyle, loadBar, loadNote, loadSide, type Plate } from "./plates";

export interface EquipmentPictureProps {
  kind: PictureKind;
  /** The bar's shape (EZ, trap, Smith); straight when not given. */
  shape?: BarShape;
  loadType: LoadType;
  /** One implement (single-arm) rather than a pair. */
  isUnilateral: boolean;
  /** What the dial worked out: unit, step, bar, plates and the value it rests at. */
  setup: Pick<DialSetup, "unit" | "step" | "bar" | "plates" | "restValue">;
  /** The weight in `setup.unit`, or null for a set with no weight yet (the picture shows the resting weight at 50%). */
  value: number | null;
  /** A machine profile exists, so the stack caption can say "of 20". */
  hasProfile?: boolean;
  /** "preview" is the 96 px picture beside the active row on desktop: no caption. */
  size?: "full" | "preview";
  /** Replaces the caption for a moment ("Limited to 400 kg"). */
  note?: string | null;
  /** Rendered at the end of the caption row (the "Bar and plates" link). */
  captionExtra?: ReactNode;
  className?: string;
}

const dot = (tone: Plate["tone"]) => <i className="eq__dot" style={{ background: `var(--plate-${tone})` }} data-tone={tone} aria-hidden="true" />;

/** The live stack: plates lift and drop with a 22 ms stagger, nearest the old pin first. Delays are set on the DOM before the change paints. */
function StackSvg({ pin, step, unit, hasProfile, label }: { pin: number; step: number; unit: WeightUnit; hasProfile: boolean; label: string }) {
  const first = stackFirstPlate(pin);
  const selected = Math.max(0, Math.min(STACK_WINDOW, pin - first + 1));
  const ref = useRef<SVGSVGElement>(null);
  const prev = useRef(selected);

  useLayoutEffect(() => {
    const svg = ref.current;
    const from = prev.current;
    prev.current = selected;
    if (!svg || from === selected) return;
    const lo = Math.min(from, selected);
    svg.querySelectorAll<SVGRectElement>(".eq-sp").forEach((plate, i) => {
      const changed = i >= lo && i < Math.max(from, selected);
      plate.style.transitionDelay = changed ? `${(selected > from ? i - from : from - 1 - i) * 22}ms` : "0ms";
    });
  }, [selected]);

  const unitText = unit === "KG" ? "kg" : "lb";
  const stepText = String(Math.round(step * 100) / 100);
  return (
    <svg ref={ref} viewBox="0 0 288 120" role="img" aria-label={label} focusable="false">
      <line className="eq-rod" x1={76} x2={76} y1={2} y2={118} />
      <line className="eq-rod" x1={212} x2={212} y1={2} y2={118} />
      <StackPlates count={STACK_WINDOW} on={selected} x={82} y={14} width={124} />
      <g className="eq-pin" style={{ transform: `translateY(${(selected - 1) * STACK_PITCH - 10}px)` }}>
        <rect x={206} y={13} width={16} height={6} rx={2} />
        <circle cx={224} cy={16} r={4} />
      </g>
      <text className="eq-small" x={236} y={58}>
        PIN
      </text>
      <text className="eq-big" x={236} y={84}>
        {pin}
      </text>
      <text className="eq-small" x={8} y={58}>
        STACK
      </text>
      <text className="eq-note" x={8} y={76}>
        {hasProfile ? `${STACK_WINDOW} × ${stepText} ${unitText}` : `${stepText} ${unitText} each`}
      </text>
    </svg>
  );
}

// ───────────────────────────── the component ─────────────────────────────

const perSideList = (perSide: readonly Plate[]) => (
  <>
    <span className="eq__lead">{PANEL_COPY.perSide}</span>
    {perSide.map((p, i) => (
      <span key={`${i}-${p.weight}`} className="eq__chip">
        {i > 0 ? <span aria-hidden="true">+ </span> : null}
        {dot(p.tone)}
        {p.weight}
      </span>
    ))}
  </>
);

/**
 * The picture of what the number means (spec section 06): plates on a bar or loading horn, dumbbells, a kettlebell or a weight
 * stack with its pin, with a one-line caption. It follows `value`: SVG groups are updated in place so CSS transitions run.
 * Barbell and horn loading come from plates.ts, so a lighter set of plates (the lifter's inventory) draws what they own.
 */
export function EquipmentPicture({ kind, shape = "straight", loadType, isUnilateral, setup, value, hasProfile = false, size = "full", note, captionExtra, className }: EquipmentPictureProps) {
  const { unit, plates, bar } = setup;
  const ghost = value === null;
  const w = value ?? setup.restValue;
  const pair = !isUnilateral && loadType === "PER_IMPLEMENT";

  let art: ReactNode;
  let caption: ReactNode = null;

  if (kind === "bar") {
    const barWeight = bar ?? 0;
    const loadout = ghost ? loadBar(barWeight, barWeight, plates) : loadBar(w, barWeight, plates);
    const label = PANEL_COPY.pictureLabel.bar(loadout.perSide.map((p) => p.weight), unit);
    art = <BarArt shape={shape} loadout={loadout} label={label} />;
    const info = loadNote(ghost ? null : w, barWeight, loadout);
    if (bar === null) caption = PANEL_COPY.barUnknown;
    else if (ghost || info?.kind === "empty") caption = PANEL_COPY.emptyBar(bar, unit);
    else if (info?.kind === "below-bar") caption = PANEL_COPY.lighterThanBar(bar, unit);
    else if (info?.kind === "inexact") caption = PANEL_COPY.inexact(info.requested, info.nearest, unit);
    else caption = perSideList(loadout.perSide);
    if (bar === null && !ghost && loadout.perSide.length > 0) caption = <>{PANEL_COPY.barUnknown} · {perSideList(loadout.perSide)}</>;
  } else if (kind === "horn") {
    const loadout = loadSide(ghost ? 0 : w, plates);
    art = <HornArt loadout={loadout} label={PANEL_COPY.pictureLabel.horn(loadout.perSide.map((p) => p.weight), unit)} />;
    if (!ghost) {
      const total = (bar ?? 0) + 2 * loadout.loaded;
      caption = (
        <>
          {loadout.perSide.length > 0 ? perSideList(loadout.perSide) : <span className="eq__lead">{PANEL_COPY.perSide} —</span>}
          {bar !== null ? <span className="eq__chip"> {PANEL_COPY.baseTotal(bar, total, unit)}</span> : null}
        </>
      );
    }
  } else if (kind === "dumbbell") {
    art = <DumbbellArt weight={w} unit={unit} pair={pair} label={PANEL_COPY.pictureLabel.dumbbell(w, unit, pair)} />;
    caption = ghost ? PANEL_COPY.turnDial : pair ? PANEL_COPY.pair(w, unit) : PANEL_COPY.one(w, unit);
  } else if (kind === "kettlebell") {
    art = <KettlebellArt weight={w} unit={unit} pair={pair} label={PANEL_COPY.pictureLabel.kettlebell(w, unit, pair)} />;
    // the dot takes the bell's own colour, not a plate's
    const { fill } = kettlebellStyle(w, unit);
    caption = (
      <>
        <i className="eq__dot" style={{ background: fill }} aria-hidden="true" />
        {ghost ? PANEL_COPY.turnDial : pair ? PANEL_COPY.bellPair(w, unit) : PANEL_COPY.bell(w, unit)}
      </>
    );
  } else {
    const pin = pinOf(w, setup);
    art = <StackSvg pin={pin} step={setup.step} unit={unit} hasProfile={hasProfile} label={PANEL_COPY.pictureLabel.stack(pin, w, unit)} />;
    caption = ghost ? PANEL_COPY.turnDial : PANEL_COPY.pin(pin, hasProfile && pin <= STACK_WINDOW ? STACK_WINDOW : null, w, setup.step, unit);
  }

  return (
    <figure className={clsx("eq", `eq--${kind}`, size === "preview" && "eq--preview", ghost && "eq--ghost", className)} data-kind={kind}>
      <div className="eq__art">{art}</div>
      {size === "full" ? (
        <figcaption className="eq__caption" data-note={note ? "true" : undefined}>
          <span className="eq__text">{note ?? caption}</span>
          {captionExtra}
        </figcaption>
      ) : null}
    </figure>
  );
}
