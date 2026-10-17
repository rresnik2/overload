// The drawing for an exercise at a given load, outside the active-set panel: library rows, the Today cards and the PR moment.
// Server-renderable (no hooks). A loaded kind with nothing logged draws a faded "ghost" at a typical weight; apparatus and
// conditioning kit have no load and always draw in full.
import clsx from "clsx";
import type { ReactElement } from "react";
import { SafeBoundary } from "@/components/ui/SafeBoundary";
import type { WeightUnit } from "@/contracts/enums";
import { DEFAULT_BAR_WEIGHT, loadBar, loadSide, PLATES, pinFor, type Plate } from "@/components/workout/plates";
import { artFor, LOADED_KINDS, resolveBelt, type ArtExercise, type ArtSpec } from "./art";
import {
  BandArt,
  BarArt,
  BattleRopeArt,
  BeltArt,
  BenchArt,
  BikeArt,
  BoxArt,
  CableArt,
  cableOn,
  DipBarsArt,
  DumbbellArt,
  ExerciseBallArt,
  FarmerArt,
  FoamRollerArt,
  GenericArt,
  HeavyBagArt,
  HornArt,
  JumpRopeArt,
  KegArt,
  KettlebellArt,
  MatArt,
  MedicineBallArt,
  PlateArt,
  PullupBarArt,
  RingsArt,
  RowerArt,
  SandbagArt,
  SledArt,
  SledgehammerArt,
  StackArt,
  StairsArt,
  StoneArt,
  StrapsArt,
  TireArt,
  TreadmillArt,
  YokeArt,
} from "./drawings";

export type ArtSize = "thumb" | "tile" | "hero";

export interface EquipmentArtProps {
  exercise: ArtExercise & { isUnilateral?: boolean };
  unit: WeightUnit;
  /** The load in `unit`: the total on a bar, per implement, per side on a horn, the weight added to bodyweight, the stack weight. null draws the ghost. */
  load: number | null;
  /** Bar weight in `unit` (null or undefined: the equipment's default bar). */
  bar?: number | null;
  /** Weight per stack plate in `unit` (null or undefined: 5 kg / 10 lb on machines, 2.5 kg / 5 lb on cables). */
  step?: number | null;
  size?: ArtSize;
  /** Plates slide on, heaviest first (the PR moment). Nothing moves under reduced motion. */
  animate?: boolean;
  /** Names the drawing as an image. Without it the drawing is decoration: the text beside it gives the load. */
  label?: string;
  className?: string;
}

/** Weights drawn for a ghost (nothing logged yet): a typical first load. */
const GHOST = { dumbbell: { KG: 10, LB: 25 }, kettlebell: { KG: 16, LB: 35 }, plate: { KG: 20, LB: 45 } } as const;
/** Strongman axles and logs have no bar profile: a 20 kg / 45 lb shaft. */
const STRONGMAN_BAR = { KG: 20, LB: 45 } as const;

/** The heaviest standard plate at or below `w` (a plate raise with "20" is the blue plate); the lightest plate below that. */
function plateFor(w: number, unit: WeightUnit): Plate {
  const plates = PLATES[unit];
  return plates.find((p) => p.weight <= w + 1e-9) ?? (plates[plates.length - 1] as Plate);
}

function barWeightFor(spec: Extract<ArtSpec, { kind: "bar" }>, exercise: ArtExercise, unit: WeightUnit, bar: number | null | undefined): number {
  if (bar != null) return bar;
  if (spec.shape === "axle" || spec.shape === "log") return STRONGMAN_BAR[unit];
  return DEFAULT_BAR_WEIGHT[exercise.equipment]?.[unit] ?? 0;
}

/** The bare drawing for `spec` (no wrapper or sizing): also the live picture's bodyweight apparatus when nothing is added. */
export function artDrawing(spec: ArtSpec, props: EquipmentArtProps): ReactElement {
  const { exercise, unit, load, label, size = "thumb" } = props;
  switch (spec.kind) {
    case "bar": {
      const bar = barWeightFor(spec, exercise, unit, props.bar);
      return <BarArt shape={spec.shape} loadout={loadBar(load ?? bar, bar, PLATES[unit])} label={label} />;
    }
    case "horn":
      return <HornArt loadout={loadSide(load ?? 0, PLATES[unit])} label={label} />;
    case "dumbbell":
      return <DumbbellArt weight={load ?? GHOST.dumbbell[unit]} unit={unit} pair={!exercise.isUnilateral && exercise.loadType === "PER_IMPLEMENT"} label={label} />;
    case "kettlebell":
      return <KettlebellArt weight={load ?? GHOST.kettlebell[unit]} unit={unit} pair={!exercise.isUnilateral && exercise.loadType === "PER_IMPLEMENT"} number={load !== null && size !== "thumb"} label={label} />;
    case "stack": {
      const step = props.step ?? (unit === "KG" ? 5 : 10);
      const pin = load !== null && load > 0 ? Math.max(1, pinFor(load, step, null)) : 0;
      return <StackArt on={Math.min(20, pin)} pin={pin || undefined} mini={size !== "hero"} label={label} />;
    }
    case "cable": {
      const step = props.step ?? (unit === "KG" ? 2.5 : 5);
      const on = load !== null && load > 0 ? cableOn(Math.max(1, pinFor(load, step, null))) : 0;
      return <CableArt attachment={spec.attachment} on={on} label={label} />;
    }
    case "belt":
      return <BeltArt plates={load !== null && load > 0 ? loadSide(load, PLATES[unit]).perSide : []} label={label} />;
    case "plate":
      return <PlateArt plate={plateFor(load ?? GHOST.plate[unit], unit)} label={label} />;
    case "medicine-ball":
      return <MedicineBallArt weight={size === "thumb" ? null : load} label={label} />;
    case "sled":
      return <SledArt plates={load !== null && load > 0 ? loadSide(load, PLATES[unit]).perSide : []} label={label} />;
    case "farmer":
      return <FarmerArt label={label} />;
    case "pullup-bar":
      return <PullupBarArt label={label} />;
    case "dip-bars":
      return <DipBarsArt label={label} />;
    case "rings":
      return <RingsArt label={label} />;
    case "straps":
      return <StrapsArt label={label} />;
    case "bench":
      return <BenchArt label={label} />;
    case "box":
      return <BoxArt label={label} />;
    case "mat":
      return <MatArt label={label} />;
    case "band":
      return <BandArt label={label} />;
    case "exercise-ball":
      return <ExerciseBallArt label={label} />;
    case "foam-roller":
      return <FoamRollerArt label={label} />;
    case "stone":
      return <StoneArt label={label} />;
    case "keg":
      return <KegArt label={label} />;
    case "sandbag":
      return <SandbagArt label={label} />;
    case "tire":
      return <TireArt label={label} />;
    case "yoke":
      return <YokeArt label={label} />;
    case "battle-rope":
      return <BattleRopeArt label={label} />;
    case "jump-rope":
      return <JumpRopeArt label={label} />;
    case "treadmill":
      return <TreadmillArt label={label} />;
    case "bike":
      return <BikeArt label={label} />;
    case "rower":
      return <RowerArt label={label} />;
    case "stairs":
      return <StairsArt label={label} />;
    case "sledgehammer":
      return <SledgehammerArt label={label} />;
    case "heavy-bag":
      return <HeavyBagArt label={label} />;
    case "generic":
      return <GenericArt label={label} />;
  }
}

/** The drawing's maths (plates per side, pins) runs here, inside the boundary. */
function Drawing({ spec, props }: { spec: ArtSpec; props: EquipmentArtProps }) {
  return artDrawing(spec, props);
}

/**
 * Drawings are an extra: a value this build does not expect (an unknown unit, a weight that is not a number, an exercise row
 * from an older bundle) draws less, never takes the page down. Inputs are normalised and the drawing has its own boundary.
 */
export function EquipmentArt(raw: EquipmentArtProps) {
  const props: EquipmentArtProps = {
    ...raw,
    unit: raw.unit === "LB" ? "LB" : "KG",
    load: typeof raw.load === "number" && Number.isFinite(raw.load) ? raw.load : null,
    bar: typeof raw.bar === "number" && Number.isFinite(raw.bar) ? raw.bar : null,
    step: typeof raw.step === "number" && Number.isFinite(raw.step) && raw.step > 0 ? raw.step : null,
  };
  const { exercise, load, size = "thumb", animate = false, className } = props;
  const spec = resolveBelt(artFor(exercise), exercise, load);
  const ghost = load === null && LOADED_KINDS.has(spec.kind);
  return (
    <span className={clsx("eq-art", `eq-art--${size}`, `eq-art--${spec.kind}`, ghost && "eq-art--ghost", animate && "eq-art--slide", className)} data-kind={spec.kind}>
      <SafeBoundary label="equipment drawing">
        <Drawing spec={spec} props={props} />
      </SafeBoundary>
    </span>
  );
}
