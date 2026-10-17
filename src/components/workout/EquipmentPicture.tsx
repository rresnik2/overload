"use client";
import clsx from "clsx";
import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { LoadType, WeightUnit } from "@/contracts/enums";
import { STACK_WINDOW, pinOf, stackFirstPlate, type DialSetup, type PictureKind } from "./dial-setup";
import { PANEL_COPY } from "./labels";
import { dumbbellScale, fitPlates, kettlebellScale, kettlebellStyle, loadBar, loadNote, loadSide, type Loadout, type Plate } from "./plates";

export interface EquipmentPictureProps {
  kind: PictureKind;
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

const SIDE_ROOM = { bar: 85, horn: 165 } as const;

// ───────────────────────────── the pictures ─────────────────────────────

function PlateRect({ plate, x, scale }: { plate: Plate; x: number; scale: number }) {
  return <rect className="eq-plate" data-tone={plate.tone} data-weight={plate.weight} x={x} y={46 - plate.height / 2} width={plate.width * scale} height={plate.height} rx={2} style={{ fill: `var(--plate-${plate.tone})` }} />;
}

/** Plates stacking outward from `start`, heaviest innermost. `dir` 1 draws to the right, -1 to the left. */
function Side({ plates, scale, start, dir, tag }: { plates: Plate[]; scale: number; start: number; dir: 1 | -1; tag: string }) {
  const out: ReactNode[] = [];
  let x = start;
  plates.forEach((p, i) => {
    const w = p.width * scale;
    const left = dir === 1 ? x : x - w;
    out.push(<PlateRect key={`${tag}-${i}-${p.weight}`} plate={p} x={left} scale={scale} />);
    x = dir === 1 ? x + w + 1.5 : x - w - 1.5;
  });
  return <>{out}</>;
}

function BarSvg({ loadout, label }: { loadout: Loadout; label: string }) {
  const fit = fitPlates(loadout.perSide, SIDE_ROOM.bar);
  return (
    <svg viewBox="0 0 300 92" role="img" aria-label={label} focusable="false">
      <rect className="eq-steel-dark" x={96} y={44} width={108} height={4} rx={1} />
      <rect className="eq-steel" x={0} y={41} width={92} height={10} rx={2} />
      <rect className="eq-steel" x={208} y={41} width={92} height={10} rx={2} />
      <rect className="eq-collar" x={90} y={35} width={7} height={22} rx={1.5} />
      <rect className="eq-collar" x={203} y={35} width={7} height={22} rx={1.5} />
      <Side plates={fit.plates} scale={fit.widthScale} start={211} dir={1} tag="r" />
      <Side plates={fit.plates} scale={fit.widthScale} start={89} dir={-1} tag="l" />
      {fit.hidden > 0 ? (
        <>
          <text className="eq-badge" x={296} y={20} textAnchor="end">
            +{fit.hidden}
          </text>
          <text className="eq-badge" x={4} y={20}>
            +{fit.hidden}
          </text>
        </>
      ) : null}
    </svg>
  );
}

/** A plate-loaded machine: the right loading horn only. */
function HornSvg({ loadout, label }: { loadout: Loadout; label: string }) {
  const fit = fitPlates(loadout.perSide, SIDE_ROOM.horn);
  return (
    <svg viewBox="0 0 300 92" role="img" aria-label={label} focusable="false">
      <rect className="eq-frame" x={104} y={30} width={16} height={32} rx={2} />
      <rect className="eq-steel" x={120} y={41} width={180} height={10} rx={2} />
      <rect className="eq-collar" x={122} y={35} width={7} height={22} rx={1.5} />
      <Side plates={fit.plates} scale={fit.widthScale} start={131} dir={1} tag="h" />
      {fit.hidden > 0 ? (
        <text className="eq-badge" x={296} y={20} textAnchor="end">
          +{fit.hidden}
        </text>
      ) : null}
    </svg>
  );
}

const HEAD = { w: 34, h: 92, k: 9 };

function dumbbellHead(x: number, side: "l" | "r") {
  const { w, h, k } = HEAD;
  const top = 60 - h / 2;
  const bottom = 60 + h / 2;
  const points = `${x},${top + k} ${x + k},${top} ${x + w - k},${top} ${x + w},${top + k} ${x + w},${bottom - k} ${x + w - k},${bottom} ${x + k},${bottom} ${x},${bottom - k}`;
  return (
    <g className={`eq-db eq-db--${side}`}>
      <polygon className="eq-iron" points={points} />
      <line className="eq-iron-edge" x1={x + w / 2} x2={x + w / 2} y1={top + 6} y2={bottom - 6} />
    </g>
  );
}

function DumbbellSvg({ weight, unit, pair, label }: { weight: number; unit: WeightUnit; pair: boolean; label: string }) {
  const k = dumbbellScale(weight, unit);
  const one = (c: number) => (
    <g key={c}>
      <rect className="eq-steel" x={c - 24} y={56} width={48} height={8} rx={2} />
      <g style={{ ["--k" as string]: k.toFixed(3) }} className="eq-db-scale">
        {dumbbellHead(c - 24 - HEAD.w, "l")}
        {dumbbellHead(c + 24, "r")}
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 288 120" role="img" aria-label={label} focusable="false">
      {pair ? [one(72), one(216)] : one(144)}
    </svg>
  );
}

function Bell({ cx, weight, unit }: { cx: number; weight: number; unit: WeightUnit }) {
  const k = kettlebellScale(weight, unit);
  const { fill, ink } = kettlebellStyle(weight, unit);
  const shown = String(Math.round(weight * 100) / 100);
  return (
    <g transform={`translate(${cx - 144} 0)`}>
      <g className="eq-kb" style={{ ["--k" as string]: k.toFixed(3) }}>
        <path className="eq-kb__handle" d="M116 64 V24 Q116 6 134 6 H154 Q172 6 172 24 V64" />
        <path className="eq-kb__body" d="M144 22 A48 48 0 0 1 182 100 L178 116 H110 L106 100 A48 48 0 0 1 144 22 Z" style={{ fill }} />
        <text className="eq-kb__num" x={144} y={82} textAnchor="middle" style={{ fill: ink }}>
          {shown}
        </text>
      </g>
    </g>
  );
}

function KettlebellSvg({ weight, unit, pair, label }: { weight: number; unit: WeightUnit; pair: boolean; label: string }) {
  return (
    <svg viewBox="0 0 288 120" role="img" aria-label={label} focusable="false">
      {pair ? (
        <>
          <Bell cx={72} weight={weight} unit={unit} />
          <Bell cx={216} weight={weight} unit={unit} />
        </>
      ) : (
        <Bell cx={144} weight={weight} unit={unit} />
      )}
    </svg>
  );
}

const PITCH = 5.2;

function StackSvg({ pin, step, unit, hasProfile, label }: { pin: number; step: number; unit: WeightUnit; hasProfile: boolean; label: string }) {
  const first = stackFirstPlate(pin);
  const selected = Math.max(0, Math.min(STACK_WINDOW, pin - first + 1));
  const ref = useRef<SVGSVGElement>(null);
  const prev = useRef(selected);

  // Plates lift and drop with a 22 ms stagger, nearest the old pin first. Delays are set on the DOM before the change paints.
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
      {Array.from({ length: STACK_WINDOW }, (_, i) => (
        <rect key={i} className={clsx("eq-sp", i < selected && "is-on")} x={82} y={14 + i * PITCH} width={124} height={4} rx={1} />
      ))}
      <g className="eq-pin" style={{ transform: `translateY(${(selected - 1) * PITCH - 10}px)` }}>
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
export function EquipmentPicture({ kind, loadType, isUnilateral, setup, value, hasProfile = false, size = "full", note, captionExtra, className }: EquipmentPictureProps) {
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
    art = <BarSvg loadout={loadout} label={label} />;
    const info = loadNote(ghost ? null : w, barWeight, loadout);
    if (bar === null) caption = PANEL_COPY.barUnknown;
    else if (ghost || info?.kind === "empty") caption = PANEL_COPY.emptyBar(bar, unit);
    else if (info?.kind === "below-bar") caption = PANEL_COPY.lighterThanBar(bar, unit);
    else if (info?.kind === "inexact") caption = PANEL_COPY.inexact(info.requested, info.nearest, unit);
    else caption = perSideList(loadout.perSide);
    if (bar === null && !ghost && loadout.perSide.length > 0) caption = <>{PANEL_COPY.barUnknown} · {perSideList(loadout.perSide)}</>;
  } else if (kind === "horn") {
    const loadout = loadSide(ghost ? 0 : w, plates);
    art = <HornSvg loadout={loadout} label={PANEL_COPY.pictureLabel.horn(loadout.perSide.map((p) => p.weight), unit)} />;
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
    art = <DumbbellSvg weight={w} unit={unit} pair={pair} label={PANEL_COPY.pictureLabel.dumbbell(w, unit, pair)} />;
    caption = ghost ? PANEL_COPY.turnDial : pair ? PANEL_COPY.pair(w, unit) : PANEL_COPY.one(w, unit);
  } else if (kind === "kettlebell") {
    art = <KettlebellSvg weight={w} unit={unit} pair={pair} label={PANEL_COPY.pictureLabel.kettlebell(w, unit, pair)} />;
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
