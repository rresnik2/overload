// The line under a drawing that says what it shows: plates per side on a bar or horn ("Per side ● 25 + ● 20 · 20 kg bar"),
// a pair of dumbbells, a bell, or the added load on a belt. Server-renderable, styled by the live picture's caption rules.
import type { ReactNode } from "react";
import type { WeightUnit } from "@/contracts/enums";
import { DEFAULT_BAR_WEIGHT, loadBar, loadSide, PLATES, type Plate } from "@/components/workout/plates";
import { formatNumber } from "@/lib/units";
import { artFor, resolveBelt, type ArtExercise } from "./art";

const u = (unit: WeightUnit) => (unit === "LB" ? "lb" : "kg");

function Chips({ plates }: { plates: readonly Plate[] }) {
  return (
    <>
      {plates.map((p, i) => (
        <span key={`${i}-${p.weight}`} className="eq__chip">
          {i > 0 ? <span aria-hidden="true">+ </span> : null}
          <i className="eq__dot" style={{ background: `var(--plate-${p.tone})` }} aria-hidden="true" />
          {formatNumber(p.weight, 2)}
        </span>
      ))}
    </>
  );
}

export function LoadCaption({ exercise, unit, load, bar }: { exercise: ArtExercise & { isUnilateral?: boolean }; unit: WeightUnit; load: number | null; bar?: number | null }) {
  if (load === null) return null;
  const spec = resolveBelt(artFor(exercise), exercise, load);
  let text: ReactNode = null;
  if (spec.kind === "bar") {
    const barWeight = bar ?? DEFAULT_BAR_WEIGHT[exercise.equipment]?.[unit] ?? 0;
    const { perSide } = loadBar(load, barWeight, PLATES[unit]);
    text =
      perSide.length > 0 ? (
        <>
          <span className="eq__lead">Per side</span>
          <Chips plates={perSide} />
          {barWeight > 0 ? <span>· {formatNumber(barWeight, 2)} {u(unit)} bar</span> : null}
        </>
      ) : barWeight > 0 ? (
        <span>Empty {formatNumber(barWeight, 2)} {u(unit)} bar</span>
      ) : null;
  } else if (spec.kind === "horn" || spec.kind === "belt" || spec.kind === "sled") {
    const { perSide } = loadSide(load, PLATES[unit]);
    text = perSide.length > 0 ? (
      <>
        <span className="eq__lead">{spec.kind === "horn" ? "Per side" : spec.kind === "belt" ? "On the belt" : "On the sled"}</span>
        <Chips plates={perSide} />
      </>
    ) : null;
  } else if (spec.kind === "dumbbell") {
    const pair = !exercise.isUnilateral && exercise.loadType === "PER_IMPLEMENT";
    text = <span>{pair ? `Pair of ${formatNumber(load, 2)} ${u(unit)}` : `One ${formatNumber(load, 2)} ${u(unit)} dumbbell`}</span>;
  } else if (spec.kind === "kettlebell") {
    text = <span>{formatNumber(load, 2)} {u(unit)} bell</span>;
  }
  if (text === null) return null;
  return (
    <p className="eq__caption eq-art__caption">
      <span className="eq__text">{text}</span>
    </p>
  );
}
