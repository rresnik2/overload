"use client";
import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { bodyweightApparatus, cableAttachment, type BarShape } from "@/components/workout/equipment/art";
import { artDrawing } from "@/components/workout/equipment/EquipmentArt";
import { BarArt, BeltArt, CableArt, cableOn, DumbbellArt, HornArt, KettlebellArt, MedicineBallArt, PlateArt, STACK_PITCH, StackPlates } from "@/components/workout/equipment/drawings";
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
  /** The exercise name: it picks a cable's attachment, and the apparatus a bodyweight-plus exercise draws with nothing added. */
  name?: string;
  /** What the dial worked out: unit, step, bar, plates and the value it rests at. */
  setup: Pick<DialSetup, "unit" | "step" | "bar" | "plates" | "restValue">;
  /** The weight in `setup.unit`, or null for a set with no weight yet (the picture shows the resting weight at 50%). */
  value: number | null;
  /** A machine profile exists, so the stack caption can say "of 20". */
  hasProfile?: boolean;
  /** The workout's bodyweight in `setup.unit`, for the bodyweight-plus caption ("Added to 82.5 kg bodyweight"). */
  bodyweight?: number | null;
  /** "preview" is the 96 px picture beside the active row on desktop: no caption. */
  size?: "full" | "preview";
  /** Replaces the caption for a moment ("Limited to 400 kg"). */
  note?: string | null;
  /** Rendered at the end of the caption row (the "Bar and plates" link). */
  captionExtra?: ReactNode;
  className?: string;
}

/** The plate a plate exercise draws, faded, before a weight is chosen. */
const GHOST_PLATE: Record<WeightUnit, number> = { KG: 20, LB: 45 };

const dot = (tone: Plate["tone"]) => <i className="eq__dot" style={{ background: `var(--plate-${tone})` }} data-tone={tone} aria-hidden="true" />;

/**
 * Stack plates lift and drop with a 22 ms stagger, nearest the old pin first. `lifted` is how many plates are up (null: not a
 * stack). The delays are set on the DOM before the change paints.
 */
function useStackStagger(root: RefObject<HTMLElement | null>, lifted: number | null) {
  const prev = useRef(lifted);
  useLayoutEffect(() => {
    const el = root.current;
    const from = prev.current;
    prev.current = lifted;
    if (!el || from === null || lifted === null || from === lifted) return;
    const lo = Math.min(from, lifted);
    el.querySelectorAll<SVGRectElement>(".eq-sp").forEach((plate, i) => {
      const changed = i >= lo && i < Math.max(from, lifted);
      plate.style.transitionDelay = changed ? `${(lifted > from ? i - from : from - 1 - i) * 22}ms` : "0ms";
    });
  }, [root, lifted]);
}

/** Plates lifted in the 20-plate window of the live stack: the window scrolls so the pin stays in view. */
const stackSelected = (pin: number): number => Math.max(0, Math.min(STACK_WINDOW, pin - stackFirstPlate(pin) + 1));

/** The live stack between its guide rods, the pin at `selected` plates of the window. */
function StackSvg({ pin, selected, step, unit, hasProfile, label }: { pin: number; selected: number; step: number; unit: WeightUnit; hasProfile: boolean; label: string }) {
  const unitText = unit === "KG" ? "kg" : "lb";
  const stepText = String(Math.round(step * 100) / 100);
  return (
    <svg viewBox="0 0 288 120" role="img" aria-label={label} focusable="false">
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

const plateList = (lead: string, plates: readonly Plate[]) => (
  <>
    <span className="eq__lead">{lead}</span>
    {plates.map((p, i) => (
      <span key={`${i}-${p.weight}`} className="eq__chip">
        {i > 0 ? <span aria-hidden="true">+ </span> : null}
        {dot(p.tone)}
        {p.weight}
      </span>
    ))}
  </>
);

/**
 * The picture of what the number means (spec section 06): plates on a bar or loading horn, dumbbells, a kettlebell, a weight
 * stack with its pin, a cable column with its attachment, a dip belt with the plates hanging (the apparatus alone while nothing
 * is added), a held plate or a medicine ball, with a one-line caption. It follows `value`: SVG groups are updated in place so
 * CSS transitions run. Plate loading comes from plates.ts, so a lighter set of plates (the lifter's inventory) draws what they own.
 */
export function EquipmentPicture({ kind, shape = "straight", loadType, isUnilateral, name = "", setup, value, hasProfile = false, bodyweight = null, size = "full", note, captionExtra, className }: EquipmentPictureProps) {
  const { unit, plates, bar } = setup;
  const ghost = value === null;
  const w = value ?? setup.restValue;
  const pair = !isUnilateral && loadType === "PER_IMPLEMENT";
  const pin = kind === "stack" || kind === "cable" ? pinOf(w, setup) : 0;
  const lifted = kind === "stack" ? stackSelected(pin) : kind === "cable" ? cableOn(pin) : null;
  const artRef = useRef<HTMLDivElement>(null);
  useStackStagger(artRef, lifted);

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
    else caption = plateList(PANEL_COPY.perSide, loadout.perSide);
    if (bar === null && !ghost && loadout.perSide.length > 0) caption = <>{PANEL_COPY.barUnknown} · {plateList(PANEL_COPY.perSide, loadout.perSide)}</>;
  } else if (kind === "horn") {
    const loadout = loadSide(ghost ? 0 : w, plates);
    art = <HornArt loadout={loadout} label={PANEL_COPY.pictureLabel.horn(loadout.perSide.map((p) => p.weight), unit)} />;
    if (!ghost) {
      const total = (bar ?? 0) + 2 * loadout.loaded;
      caption = (
        <>
          {loadout.perSide.length > 0 ? plateList(PANEL_COPY.perSide, loadout.perSide) : <span className="eq__lead">{PANEL_COPY.perSide} —</span>}
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
  } else if (kind === "cable") {
    // The tower draws ten plates, so the caption gives the pin without "of 20".
    const attachment = cableAttachment(name);
    art = <CableArt attachment={attachment} on={lifted ?? 0} label={PANEL_COPY.pictureLabel.cable(attachment, pin, w, unit)} />;
    caption = ghost ? PANEL_COPY.turnDial : PANEL_COPY.pin(pin, null, w, setup.step, unit);
  } else if (kind === "belt") {
    if (w > 0) {
      const loadout = loadSide(w, plates);
      art = <BeltArt plates={loadout.perSide} label={PANEL_COPY.pictureLabel.belt(loadout.perSide.map((p) => p.weight), unit)} />;
      caption = ghost ? (
        PANEL_COPY.turnDialToAdd
      ) : (
        <>
          {loadout.exact ? plateList(PANEL_COPY.onBelt, loadout.perSide) : <span>{loadout.loaded > 0 ? PANEL_COPY.inexact(w, loadout.loaded, unit) : PANEL_COPY.noPlate(w, unit)}</span>}
          {bodyweight !== null ? <span>{PANEL_COPY.addedToBodyweight(bodyweight, unit)}</span> : null}
        </>
      );
    } else {
      // Nothing added: the pull-up bar, the dip bars or the mat, as the exercise's drawing elsewhere shows it.
      const apparatus = bodyweightApparatus(name);
      art = artDrawing(apparatus, { exercise: { equipment: "BODYWEIGHT", loadType, name }, unit, load: null, label: PANEL_COPY.pictureLabel.apparatus(apparatus.kind) });
      caption = ghost ? PANEL_COPY.turnDialToAdd : PANEL_COPY.bodyweightOnly(bodyweight, unit);
    }
  } else if (kind === "plate") {
    // no weight yet: the faded plate is a typical one (the 20 kg / 45 lb), as the library rows draw it, not the dial's 2.5
    const loadout = loadSide(ghost ? GHOST_PLATE[unit] : w, plates);
    // the heaviest plate in the weight; below the lightest plate, the lightest
    const held = loadout.perSide[0] ?? (plates[plates.length - 1] as Plate);
    art = <PlateArt plate={held} label={PANEL_COPY.pictureLabel.plate(loadout.perSide.length > 0 ? loadout.perSide.map((p) => p.weight) : [held.weight], unit)} />;
    if (ghost) caption = PANEL_COPY.turnDial;
    else if (loadout.perSide.length === 0) caption = PANEL_COPY.noPlate(w, unit);
    else if (!loadout.exact) caption = PANEL_COPY.inexact(w, loadout.loaded, unit);
    else if (loadout.perSide.length === 1)
      caption = (
        <>
          {dot(held.tone)}
          {PANEL_COPY.onePlate(w, unit)}
        </>
      );
    else caption = plateList(PANEL_COPY.plates, loadout.perSide);
  } else if (kind === "medicine-ball") {
    art = <MedicineBallArt weight={ghost ? null : w} label={PANEL_COPY.pictureLabel.medicineBall(w, unit)} />;
    caption = ghost ? PANEL_COPY.turnDial : PANEL_COPY.ball(w, unit);
  } else {
    art = <StackSvg pin={pin} selected={lifted ?? 0} step={setup.step} unit={unit} hasProfile={hasProfile} label={PANEL_COPY.pictureLabel.stack(pin, w, unit)} />;
    caption = ghost ? PANEL_COPY.turnDial : PANEL_COPY.pin(pin, hasProfile && pin <= STACK_WINDOW ? STACK_WINDOW : null, w, setup.step, unit);
  }

  return (
    <figure className={clsx("eq", `eq--${kind}`, size === "preview" && "eq--preview", ghost && "eq--ghost", className)} data-kind={kind}>
      <div className="eq__art" ref={artRef}>
        {art}
      </div>
      {size === "full" ? (
        <figcaption className="eq__caption" data-note={note ? "true" : undefined}>
          <span className="eq__text">{note ?? caption}</span>
          {captionExtra}
        </figcaption>
      ) : null}
    </figure>
  );
}
