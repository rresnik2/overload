// The equipment drawings: flat, side-on (or face-on where that reads better), no perspective and no shading, in the
// Calibrated Dial palette. Plates are drawn in their real colours (they are data); everything else is iron, steel or a
// neutral body colour from the theme. Static SVG with no hooks, so server components can render them. The live picture in the
// active-set panel (workout/EquipmentPicture) builds on the same bar, horn, dumbbell, kettlebell, stack, cable, belt, plate
// and medicine ball drawings.
// Canvases: bars and horns 300 x 92 (plate heights in plates.ts are in these units), everything else 288 x 120, ground at 116.
import clsx from "clsx";
import type { ReactNode } from "react";
import type { WeightUnit } from "@/contracts/enums";
import { dumbbellScale, fitPlates, kettlebellScale, kettlebellStyle, type Loadout, type Plate } from "@/components/workout/plates";
import type { BarShape, CableAttachment } from "./art";

/** `label` makes the drawing an image with that name; without one it is decoration (the text beside it says the same). */
interface Labelled {
  label?: string;
}

function Svg({ viewBox, label, className, children }: Labelled & { viewBox: string; className?: string; children: ReactNode }) {
  return label ? (
    <svg viewBox={viewBox} role="img" aria-label={label} focusable="false" className={className}>
      {children}
    </svg>
  ) : (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" className={className}>
      {children}
    </svg>
  );
}

const fill = (tone: Plate["tone"]) => ({ fill: `var(--plate-${tone})` });

// ───────────────────────────── plates ─────────────────────────────

/** A plate seen edge-on, centred on y 46 of the bar canvas. `i` staggers the slide-on animation (heaviest first). */
function PlateRect({ plate, x, scale, i }: { plate: Plate; x: number; scale: number; i: number }) {
  return (
    <rect
      className="eq-plate"
      data-tone={plate.tone}
      data-weight={plate.weight}
      x={x}
      y={46 - plate.height / 2}
      width={plate.width * scale}
      height={plate.height}
      rx={2}
      style={{ ...fill(plate.tone), ["--i" as string]: i }}
    />
  );
}

/** Plates stacking outward from `start`, heaviest innermost. `dir` 1 draws to the right, -1 to the left. */
export function PlateSide({ plates, scale, start, dir, tag }: { plates: readonly Plate[]; scale: number; start: number; dir: 1 | -1; tag: string }) {
  const out: ReactNode[] = [];
  let x = start;
  plates.forEach((p, i) => {
    const w = p.width * scale;
    out.push(<PlateRect key={`${tag}-${i}-${p.weight}`} plate={p} x={dir === 1 ? x : x - w} scale={scale} i={i} />);
    x = dir === 1 ? x + w + 1.5 : x - w - 1.5;
  });
  return <g className={`eq-side eq-side--${dir === 1 ? "r" : "l"}`}>{out}</g>;
}

/** A plate seen face-on: the coloured disc, its raised lip and the steel hub. `d` is the diameter. */
export function PlateFace({ plate, cx, cy, d, i = 0, grips = false }: { plate: Plate; cx: number; cy: number; d: number; i?: number; grips?: boolean }) {
  const r = d / 2;
  return (
    <g className="eq-plate eq-plate--face" data-tone={plate.tone} data-weight={plate.weight} style={{ ["--i" as string]: i }}>
      <circle cx={cx} cy={cy} r={r} style={fill(plate.tone)} className="eq-plate__disc" />
      <circle cx={cx} cy={cy} r={r * 0.78} className="eq-plate__lip" />
      {grips
        ? [90, 210, 330].map((deg) => {
            const a = (deg * Math.PI) / 180;
            return <ellipse key={deg} className="eq-slot" cx={cx + Math.cos(a) * r * 0.5} cy={cy + Math.sin(a) * r * 0.5} rx={r * 0.2} ry={r * 0.09} transform={`rotate(${deg + 90} ${cx + Math.cos(a) * r * 0.5} ${cy + Math.sin(a) * r * 0.5})`} />;
          })
        : null}
      <circle cx={cx} cy={cy} r={Math.max(3, r * 0.17)} className="eq-steel" />
      <circle cx={cx} cy={cy} r={Math.max(1.5, r * 0.07)} className="eq-slot" />
    </g>
  );
}

/** Face-on diameter, in the 288 x 120 canvas, of a plate whose edge-on height is `plate.height` (bar canvas units). */
const faceDiameter = (plate: Plate, k = 0.72) => plate.height * k;

// ───────────────────────────── bars ─────────────────────────────

export const SIDE_ROOM = { bar: 85, horn: 165 } as const;

/** Loadable sleeve length per shape, in canvas units from the collar: an EZ bar's sleeves are about two thirds of an Olympic bar's. */
const SLEEVE: Record<BarShape, number> = { straight: 92, ez: 62, trap: 92, smith: 92, axle: 92, log: 92 };

function Shaft({ shape }: { shape: BarShape }) {
  switch (shape) {
    case "ez":
      // one V-dip each side of a straight centre, mirrored (Rogue curl bar: 800 mm between sleeves, dips about 45 mm deep)
      return <path className="eq-shaft" d="M96 46 H114 L129 53 L140 46 H160 L171 53 L186 46 H204" />;
    case "trap":
      // seen from above: the hexagon you stand in, with a handle on each side
      return (
        <>
          <polygon className="eq-hex" points="97,46 117,13 183,13 203,46 183,79 117,79" />
          <rect className="eq-steel" x={125} y={31} width={7} height={30} rx={2} />
          <rect className="eq-steel" x={168} y={31} width={7} height={30} rx={2} />
        </>
      );
    case "axle":
      return <rect className="eq-steel" x={96} y={40} width={108} height={12} rx={2} />;
    case "log":
      return (
        <>
          <rect className="eq-iron" x={98} y={22} width={104} height={48} rx={20} />
          <rect className="eq-slot" x={128} y={32} width={10} height={28} rx={4} />
          <rect className="eq-slot" x={162} y={32} width={10} height={28} rx={4} />
        </>
      );
    default:
      return <rect className="eq-steel-dark" x={96} y={44} width={108} height={4} rx={1} />;
  }
}

/** A loaded bar (barbell, EZ, trap, Smith, axle or log): plates per side from `loadout`, heaviest innermost. */
export function BarArt({ loadout, shape = "straight", label }: Labelled & { loadout: Loadout; shape?: BarShape }) {
  const sleeve = SLEEVE[shape];
  const fit = fitPlates(loadout.perSide, Math.min(SIDE_ROOM.bar, sleeve - 7));
  return (
    <Svg viewBox="0 0 300 92" label={label} className={`eq-bar eq-bar--${shape}`}>
      {shape === "smith" ? (
        <>
          <rect className="eq-rail" x={99} y={0} width={5} height={92} rx={1} />
          <rect className="eq-rail" x={196} y={0} width={5} height={92} rx={1} />
          <rect className="eq-iron" x={95} y={80} width={13} height={7} rx={1} />
          <rect className="eq-iron" x={192} y={80} width={13} height={7} rx={1} />
        </>
      ) : null}
      <Shaft shape={shape} />
      <rect className="eq-steel" x={92 - sleeve} y={41} width={sleeve} height={10} rx={2} />
      <rect className="eq-steel" x={208} y={41} width={sleeve} height={10} rx={2} />
      <rect className="eq-collar" x={90} y={35} width={7} height={22} rx={1.5} />
      <rect className="eq-collar" x={203} y={35} width={7} height={22} rx={1.5} />
      {shape === "smith" ? (
        <>
          <rect className="eq-iron" x={97} y={36} width={9} height={8} rx={1} />
          <rect className="eq-iron" x={194} y={36} width={9} height={8} rx={1} />
        </>
      ) : null}
      <PlateSide plates={fit.plates} scale={fit.widthScale} start={211} dir={1} tag="r" />
      <PlateSide plates={fit.plates} scale={fit.widthScale} start={89} dir={-1} tag="l" />
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
    </Svg>
  );
}

/** A plate-loaded machine: the right loading horn only. */
export function HornArt({ loadout, label }: Labelled & { loadout: Loadout }) {
  const fit = fitPlates(loadout.perSide, SIDE_ROOM.horn);
  return (
    <Svg viewBox="0 0 300 92" label={label} className="eq-horn">
      <rect className="eq-frame" x={104} y={30} width={16} height={32} rx={2} />
      <rect className="eq-steel" x={120} y={41} width={180} height={10} rx={2} />
      <rect className="eq-collar" x={122} y={35} width={7} height={22} rx={1.5} />
      <PlateSide plates={fit.plates} scale={fit.widthScale} start={131} dir={1} tag="h" />
      {fit.hidden > 0 ? (
        <text className="eq-badge" x={296} y={20} textAnchor="end">
          +{fit.hidden}
        </text>
      ) : null}
    </Svg>
  );
}

// ───────────────────────────── dumbbells and kettlebells ─────────────────────────────

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

/** One hex dumbbell, or a pair. The heads grow with the weight (plates.ts dumbbellScale). */
export function DumbbellArt({ weight, unit, pair, label }: Labelled & { weight: number; unit: WeightUnit; pair: boolean }) {
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
    <Svg viewBox="0 0 288 120" label={label} className="eq-dumbbell">
      {pair ? [one(72), one(216)] : one(144)}
    </Svg>
  );
}

function Bell({ cx, weight, unit, number }: { cx: number; weight: number; unit: WeightUnit; number: boolean }) {
  const k = kettlebellScale(weight, unit);
  const { fill: bellFill, ink } = kettlebellStyle(weight, unit);
  const shown = String(Math.round(weight * 100) / 100);
  return (
    <g transform={`translate(${cx - 144} 0)`}>
      <g className="eq-kb" style={{ ["--k" as string]: k.toFixed(3) }}>
        <path className="eq-kb__handle" d="M116 64 V24 Q116 6 134 6 H154 Q172 6 172 24 V64" />
        <path className="eq-kb__body" d="M144 22 A48 48 0 0 1 182 100 L178 116 H110 L106 100 A48 48 0 0 1 144 22 Z" style={{ fill: bellFill }} />
        {number ? (
          <text className="eq-kb__num" x={144} y={82} textAnchor="middle" style={{ fill: ink }}>
            {shown}
          </text>
        ) : null}
      </g>
    </g>
  );
}

/** A kettlebell (or a pair) in its competition colour, the size growing with the weight. */
export function KettlebellArt({ weight, unit, pair, number = true, label }: Labelled & { weight: number; unit: WeightUnit; pair: boolean; number?: boolean }) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-kettlebell">
      {pair ? (
        <>
          <Bell cx={72} weight={weight} unit={unit} number={number} />
          <Bell cx={216} weight={weight} unit={unit} number={number} />
        </>
      ) : (
        <Bell cx={144} weight={weight} unit={unit} number={number} />
      )}
    </Svg>
  );
}

// ───────────────────────────── weight stacks and cables ─────────────────────────────

export const STACK_PITCH = 5.2;

/** The plates of a stack, `on` of them lifted by the pin. Shared by the live picture (which animates them) and the static one. */
export function StackPlates({ count, on, x, y, width, pitch = STACK_PITCH }: { count: number; on: number; x: number; y: number; width: number; pitch?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} className={clsx("eq-sp", i < on && "is-on")} x={x} y={y + i * pitch} width={width} height={pitch - 1.2} rx={1} />
      ))}
    </>
  );
}

/** A selectorized stack between its guide rods with the pin at `on` plates. `mini` drops the labels (thumbnails). */
export function StackArt({ on, count = 20, pin, note, mini = false, label }: Labelled & { on: number; count?: number; pin?: number; note?: string; mini?: boolean }) {
  const pitch = mini ? 100 / count : STACK_PITCH;
  const top = mini ? 12 : 14;
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-stack">
      <line className="eq-rod" x1={76} x2={76} y1={2} y2={118} />
      <line className="eq-rod" x1={212} x2={212} y1={2} y2={118} />
      <StackPlates count={count} on={on} x={82} y={top} width={124} pitch={pitch} />
      {on > 0 ? (
        <g className="eq-pin" style={{ transform: `translateY(${(on - 1) * pitch - 10}px)` }}>
          <rect x={206} y={top - 1} width={16} height={6} rx={2} />
          <circle cx={224} cy={top + 2} r={4} />
        </g>
      ) : null}
      {!mini && pin !== undefined ? (
        <>
          <text className="eq-small" x={236} y={58}>
            PIN
          </text>
          <text className="eq-big" x={236} y={84}>
            {pin}
          </text>
        </>
      ) : null}
      {!mini && note ? (
        <>
          <text className="eq-small" x={8} y={58}>
            STACK
          </text>
          <text className="eq-note" x={8} y={76}>
            {note}
          </text>
        </>
      ) : null}
    </Svg>
  );
}

function Attachment({ kind }: { kind: CableAttachment }) {
  switch (kind) {
    case "rope":
      return (
        <g className="eq-att eq-att--rope">
          <path className="eq-rope" d="M196 60 L176 102 M196 60 L216 102" />
          <circle className="eq-iron" cx={175} cy={104} r={6} />
          <circle className="eq-iron" cx={217} cy={104} r={6} />
        </g>
      );
    case "straight-bar":
      return (
        <g className="eq-att">
          <line className="eq-cable" x1={196} x2={196} y1={58} y2={70} />
          <rect className="eq-steel" x={150} y={70} width={92} height={7} rx={3} />
          <rect className="eq-iron" x={156} y={69} width={18} height={9} rx={3} />
          <rect className="eq-iron" x={218} y={69} width={18} height={9} rx={3} />
        </g>
      );
    case "v-bar":
      return (
        <g className="eq-att">
          <path className="eq-vbar" d="M168 102 L196 62 L224 102" />
          <line className="eq-grip" x1={170} y1={99} x2={178} y2={88} />
          <line className="eq-grip" x1={222} y1={99} x2={214} y2={88} />
        </g>
      );
    case "lat-bar":
      return (
        <g className="eq-att">
          <path className="eq-vbar" d="M120 78 L136 62 H256 L272 78" />
          <line className="eq-grip" x1={122} y1={76} x2={132} y2={66} />
          <line className="eq-grip" x1={270} y1={76} x2={260} y2={66} />
        </g>
      );
    case "ankle-strap":
      return (
        <g className="eq-att">
          <circle className="eq-ring" cx={196} cy={63} r={5} />
          <rect className="eq-strap" x={180} y={68} width={32} height={34} rx={11} />
        </g>
      );
    default:
      // the stirrup: a single D-handle
      return (
        <g className="eq-att">
          <path className="eq-vbar" d="M196 60 L180 94 M196 60 L212 94" />
          <rect className="eq-iron" x={174} y={91} width={44} height={10} rx={5} />
        </g>
      );
  }
}

/** Plates drawn in a cable column's tower. */
export const CABLE_PLATES = 10;

/** Plates lifted in the cable drawing for a pin: one drawn plate per two pins, so a 20-pin load fills the tower. 0 for no load. */
export const cableOn = (pin: number): number => (pin > 0 ? Math.min(CABLE_PLATES, Math.max(1, Math.round(pin / 2))) : 0);

/** A cable column: the stack in its tower, the cable over two pulleys and the attachment the exercise uses. */
export function CableArt({ attachment, on, label }: Labelled & { attachment: CableAttachment; on: number }) {
  const count = CABLE_PLATES;
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-cable-art">
      <rect className="eq-tower" x={26} y={4} width={64} height={112} rx={3} />
      <StackPlates count={count} on={on} x={34} y={44} width={48} pitch={7} />
      <path className="eq-cable" d="M58 44 V14 M64 8 H190 M202 16 V58" />
      <circle className="eq-pulley" cx={58} cy={12} r={7} />
      <circle className="eq-pulley" cx={196} cy={12} r={9} />
      <circle className="eq-steel" cx={196} cy={12} r={3} />
      <circle className="eq-ring" cx={196} cy={60} r={4} />
      <Attachment kind={attachment} />
    </Svg>
  );
}

// ───────────────────────────── loaded bodyweight, plates and balls ─────────────────────────────

/** A dip belt: the belt, its chain, and the added plates hanging face-on (the heaviest at the back). */
export function BeltArt({ plates, label }: Labelled & { plates: readonly Plate[] }) {
  const shown = plates.slice(0, 4);
  const d0 = shown.length > 0 ? faceDiameter(shown[0]!) : 40;
  const cy = 56 + d0 / 2;
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-belt">
      <path className="eq-belt__strap" d="M90 14 Q144 34 198 14" />
      <circle className="eq-ring" cx={90} cy={16} r={5} />
      <circle className="eq-ring" cx={198} cy={16} r={5} />
      <path className="eq-chain" d="M91 21 Q102 50 144 56 M197 21 Q186 50 144 56" />
      {shown.map((p, i) => (
        <PlateFace key={`${i}-${p.weight}`} plate={p} cx={144} cy={cy} d={faceDiameter(p)} i={i} />
      ))}
      {shown.length === 0 ? <circle className="eq-ring" cx={144} cy={58} r={4} /> : null}
    </Svg>
  );
}

/** A plate held by its grips (plate raises, pinches, Svend presses). */
export function PlateArt({ plate, label }: Labelled & { plate: Plate }) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-plate-art">
      <PlateFace plate={plate} cx={144} cy={60} d={Math.max(64, plate.height * 1.25)} grips />
    </Svg>
  );
}

/** A medicine ball, its weight printed on it when known. */
export function MedicineBallArt({ weight, label }: Labelled & { weight: number | null }) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-medball">
      <circle className="eq-iron" cx={144} cy={66} r={48} />
      <path className="eq-seam" d="M100 46 Q144 76 188 46 M100 86 Q144 56 188 86" />
      {weight !== null ? (
        <text className="eq-ball__num" x={144} y={76} textAnchor="middle">
          {String(Math.round(weight * 10) / 10)}
        </text>
      ) : null}
    </Svg>
  );
}

/** A sled with its high handles; the plates lie flat on the post, heaviest at the bottom. */
export function SledArt({ plates, label }: Labelled & { plates: readonly Plate[] }) {
  const out: ReactNode[] = [];
  let y = 92;
  plates.slice(0, 6).forEach((p, i) => {
    const w = p.height * 0.9;
    const h = Math.max(4, p.width * 0.7);
    y -= h + 1;
    out.push(<rect key={`${i}-${p.weight}`} className="eq-plate" data-tone={p.tone} x={136 - w / 2} y={y} width={w} height={h} rx={1.5} style={{ ...fill(p.tone), ["--i" as string]: i }} />);
  });
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-sled">
      <path className="eq-runner" d="M34 110 H230 Q250 110 252 92" />
      <path className="eq-handle" d="M70 92 L46 30 M92 92 L68 30" />
      <rect className="eq-iron" x={56} y={92} width={168} height={12} rx={2} />
      <rect className="eq-steel" x={132} y={34} width={8} height={58} rx={2} />
      {out}
    </Svg>
  );
}

// ───────────────────────────── bodyweight apparatus ─────────────────────────────

export function PullupBarArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-pullup">
      <rect className="eq-iron" x={34} y={4} width={12} height={108} rx={2} />
      <rect className="eq-iron" x={242} y={4} width={12} height={108} rx={2} />
      {[30, 46, 62, 78, 94].map((y) => (
        <g key={y}>
          <circle className="eq-slot" cx={40} cy={y} r={2} />
          <circle className="eq-slot" cx={248} cy={y} r={2} />
        </g>
      ))}
      <rect className="eq-steel" x={40} y={14} width={208} height={8} rx={4} />
      <path className="eq-knurl" d="M96 15 V21 M101 15 V21 M106 15 V21 M111 15 V21 M177 15 V21 M182 15 V21 M187 15 V21 M192 15 V21" />
      <rect className="eq-iron" x={24} y={110} width={32} height={6} rx={2} />
      <rect className="eq-iron" x={232} y={110} width={32} height={6} rx={2} />
    </Svg>
  );
}

export function DipBarsArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-dips">
      <rect className="eq-iron" x={86} y={36} width={10} height={76} rx={2} />
      <rect className="eq-iron" x={192} y={36} width={10} height={76} rx={2} />
      <rect className="eq-iron" x={91} y={74} width={106} height={7} rx={2} />
      <rect className="eq-iron" x={62} y={108} width={164} height={8} rx={2} />
      <circle className="eq-steel" cx={91} cy={30} r={10} />
      <circle className="eq-steel" cx={197} cy={30} r={10} />
      <circle className="eq-slot" cx={91} cy={30} r={4} />
      <circle className="eq-slot" cx={197} cy={30} r={4} />
    </Svg>
  );
}

export function RingsArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-rings">
      <path className="eq-strap-line" d="M112 0 V62 M176 0 V62" />
      <rect className="eq-steel" x={107} y={36} width={10} height={8} rx={1} />
      <rect className="eq-steel" x={171} y={36} width={10} height={8} rx={1} />
      <circle className="eq-ring-big" cx={112} cy={80} r={17} />
      <circle className="eq-ring-big" cx={176} cy={80} r={17} />
    </Svg>
  );
}

export function StrapsArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-straps">
      <rect className="eq-steel" x={138} y={0} width={12} height={8} rx={2} />
      <path className="eq-strap-line" d="M144 8 V40 L120 90 M144 40 L168 90" />
      <rect className="eq-steel" x={139} y={36} width={10} height={8} rx={1} />
      <rect className="eq-iron" x={106} y={90} width={28} height={9} rx={4} />
      <rect className="eq-iron" x={154} y={90} width={28} height={9} rx={4} />
    </Svg>
  );
}

export function BenchArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-bench">
      <rect className="eq-steel-dark" x={58} y={64} width={172} height={6} rx={1} />
      <rect className="eq-steel-dark" x={68} y={68} width={8} height={42} rx={1} />
      <rect className="eq-steel-dark" x={212} y={68} width={8} height={42} rx={1} />
      <rect className="eq-steel-dark" x={50} y={108} width={44} height={7} rx={2} />
      <rect className="eq-steel-dark" x={194} y={108} width={44} height={7} rx={2} />
      <rect className="eq-iron" x={46} y={50} width={196} height={14} rx={6} />
    </Svg>
  );
}

export function BoxArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-box">
      <polygon className="eq-body" points="90,36 198,36 210,116 78,116" />
      <rect className="eq-slot" x={126} y={50} width={36} height={9} rx={4} />
    </Svg>
  );
}

export function MatArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-mat">
      <rect className="eq-body" x={18} y={104} width={222} height={8} rx={2} />
      <circle className="eq-body" cx={240} cy={96} r={16} />
      <circle className="eq-seam" cx={240} cy={96} r={10} />
      <circle className="eq-seam" cx={240} cy={96} r={4} />
    </Svg>
  );
}

export function BandArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-band">
      <path className="eq-band__loop" d="M66 42 H222 A28 28 0 0 1 222 98 H66 A28 28 0 0 1 66 42 Z" />
    </Svg>
  );
}

export function ExerciseBallArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-swissball">
      <circle className="eq-body" cx={144} cy={62} r={54} />
      <path className="eq-seam" d="M122 12 Q98 62 122 112 M166 12 Q190 62 166 112" />
    </Svg>
  );
}

export function FoamRollerArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-roller">
      <rect className="eq-body" x={36} y={56} width={208} height={40} rx={5} />
      <ellipse className="eq-body" cx={244} cy={76} rx={9} ry={20} />
      <path className="eq-seam eq-seam--dash" d="M52 66 H230 M52 76 H230 M52 86 H230" />
    </Svg>
  );
}

// ───────────────────────────── strongman and conditioning ─────────────────────────────

export function StoneArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-stone">
      <ellipse className="eq-body" cx={144} cy={70} rx={50} ry={46} />
      {[
        [124, 52],
        [160, 60],
        [138, 86],
        [170, 92],
        [112, 78],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} className="eq-fleck" cx={x} cy={y} r={2.2} />
      ))}
    </Svg>
  );
}

export function KegArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-keg">
      <rect className="eq-steel" x={98} y={18} width={92} height={98} rx={14} />
      <path className="eq-rib" d="M100 38 H188 M100 96 H188" />
      <rect className="eq-slot" x={116} y={24} width={18} height={7} rx={3} />
      <rect className="eq-slot" x={154} y={24} width={18} height={7} rx={3} />
    </Svg>
  );
}

export function SandbagArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-sandbag">
      <path className="eq-handle-loop" d="M108 62 Q118 40 128 62 M160 62 Q170 40 180 62" />
      <rect className="eq-body" x={54} y={58} width={180} height={56} rx={26} />
      <path className="eq-seam" d="M78 86 H210" />
    </Svg>
  );
}

export function TireArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-tire">
      <circle className="eq-iron" cx={144} cy={62} r={54} />
      <circle className="eq-tread" cx={144} cy={62} r={49} />
      <circle className="eq-slot eq-slot--edged" cx={144} cy={62} r={26} />
    </Svg>
  );
}

export function YokeArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-yoke">
      <rect className="eq-iron" x={64} y={10} width={10} height={102} rx={2} />
      <rect className="eq-iron" x={214} y={10} width={10} height={102} rx={2} />
      <rect className="eq-steel" x={56} y={20} width={176} height={12} rx={5} />
      <rect className="eq-iron" x={48} y={110} width={42} height={6} rx={2} />
      <rect className="eq-iron" x={198} y={110} width={42} height={6} rx={2} />
      <rect className="eq-steel" x={40} y={84} width={24} height={6} rx={2} />
      <rect className="eq-steel" x={224} y={84} width={24} height={6} rx={2} />
      <rect className="eq-iron" x={46} y={60} width={9} height={54} rx={2} />
      <rect className="eq-iron" x={233} y={60} width={9} height={54} rx={2} />
    </Svg>
  );
}

export function FarmerArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-farmer">
      <rect className="eq-steel-dark" x={44} y={74} width={200} height={8} rx={2} />
      <path className="eq-handle" d="M122 74 V52 M166 74 V52" />
      <rect className="eq-steel" x={114} y={46} width={60} height={9} rx={4} />
      <rect className="eq-iron" x={46} y={52} width={10} height={52} rx={2} />
      <rect className="eq-iron" x={232} y={52} width={10} height={52} rx={2} />
    </Svg>
  );
}

export function BattleRopeArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-battle">
      <rect className="eq-iron" x={244} y={56} width={12} height={60} rx={2} />
      <path className="eq-rope" d="M244 70 C 222 40, 196 98, 172 66 S 120 36, 96 64 S 56 92, 36 70" />
      <path className="eq-rope" d="M244 84 C 220 110, 196 56, 172 86 S 122 112, 98 88 S 58 62, 36 94" />
    </Svg>
  );
}

export function JumpRopeArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-jumprope">
      <path className="eq-cord" d="M100 84 C 92 -6, 196 -6, 188 84" />
      <rect className="eq-iron" x={94} y={82} width={12} height={32} rx={5} />
      <rect className="eq-iron" x={182} y={82} width={12} height={32} rx={5} />
    </Svg>
  );
}

export function TreadmillArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-treadmill">
      <path className="eq-post" d="M220 98 L246 26 M236 54 H196" />
      <rect className="eq-iron" x={230} y={12} width={44} height={18} rx={3} transform="rotate(-12 252 21)" />
      <polygon className="eq-iron" points="34,104 228,94 232,108 34,114" />
      <circle className="eq-steel" cx={40} cy={109} r={4} />
      <circle className="eq-steel" cx={224} cy={101} r={4} />
    </Svg>
  );
}

export function BikeArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-bike">
      <path className="eq-post" d="M66 112 H232 M112 112 L100 44 M186 86 L212 30 M108 76 L190 82" />
      <circle className="eq-iron" cx={212} cy={86} r={24} />
      <circle className="eq-steel" cx={212} cy={86} r={5} />
      <rect className="eq-iron" x={80} y={36} width={42} height={9} rx={4} />
      <path className="eq-handle" d="M202 28 H238" />
      <circle className="eq-steel" cx={150} cy={92} r={8} />
      <path className="eq-handle" d="M150 92 L162 106" />
    </Svg>
  );
}

export function RowerArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-rower">
      <rect className="eq-steel" x={36} y={96} width={202} height={6} rx={2} />
      <rect className="eq-steel-dark" x={38} y={100} width={10} height={16} rx={2} />
      <circle className="eq-iron" cx={238} cy={78} r={26} />
      <circle className="eq-steel" cx={238} cy={78} r={5} />
      <rect className="eq-iron" x={104} y={86} width={38} height={10} rx={3} />
      <rect className="eq-iron" x={200} y={66} width={8} height={30} rx={2} transform="rotate(-18 204 81)" />
      <path className="eq-cable" d="M192 62 L232 72" />
      <rect className="eq-steel" x={184} y={56} width={10} height={14} rx={3} />
    </Svg>
  );
}

export function StairsArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-stairs">
      <path className="eq-body" d="M44 116 V96 H84 V76 H124 V56 H164 V36 H204 V116 Z" />
      <path className="eq-handle" d="M216 24 V116 M60 64 L216 24" />
    </Svg>
  );
}

export function SledgehammerArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-hammer">
      <path className="eq-shaft-wood" d="M90 114 L196 26" />
      <rect className="eq-iron" x={176} y={4} width={58} height={26} rx={3} transform="rotate(-40 205 17)" />
    </Svg>
  );
}

export function HeavyBagArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-heavybag">
      <path className="eq-chain" d="M144 0 V12 M144 12 L122 22 M144 12 L166 22" />
      <rect className="eq-iron" x={114} y={20} width={60} height={96} rx={12} />
      <path className="eq-rib" d="M116 38 H172 M116 98 H172" />
    </Svg>
  );
}

/** The last resort: a plain iron plate. */
export function GenericArt({ label }: Labelled) {
  return (
    <Svg viewBox="0 0 288 120" label={label} className="eq-generic">
      <circle className="eq-iron" cx={144} cy={62} r={44} />
      <circle className="eq-seam" cx={144} cy={62} r={34} />
      <circle className="eq-steel" cx={144} cy={62} r={8} />
    </Svg>
  );
}
