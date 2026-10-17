// What the dial and the equipment picture need for one set: which picture, the bar and plates, the dial's values and
// where it rests. PURE (no react): shared by ActiveSetPanel and the 96 px preview on desktop. Every weight is in the row's
// display unit (kg or lb); storage stays kg (session.ts weightPatch).
import type { ExerciseRow, MachineProfileRow } from "@/contracts/entities";
import type { Equipment, WeightUnit } from "@/contracts/enums";
import { fromKg } from "@/lib/units";
import { DEFAULT_BAR_WEIGHT, DIAL_MAX, KETTLEBELL_SIZES, dialValues, pinFor, plateSet, type Plate, type PlateTone } from "./plates";

export type PictureKind = "bar" | "horn" | "dumbbell" | "kettlebell" | "stack" | "cable" | "belt" | "plate" | "medicine-ball";

export type DialExercise = Pick<ExerciseRow, "equipment" | "loadType" | "isUnilateral">;

/** The parts of a MachineProfile the dial reads. `platesKg` is optional: Dexie rows written before the field lack it. */
export type DialMachine = Pick<MachineProfileRow, "pinStepKg" | "baseLoadKg"> & { platesKg?: readonly number[] | null };

/** The parts of a gear profile the dial reads: the dumbbell step (`pinStepKg`) or the kettlebells owned (`platesKg`; null = standard sizes). */
export type DialGear = Pick<MachineProfileRow, "pinStepKg"> & { platesKg?: readonly number[] | null };

const BAR_EQUIPMENT: readonly Equipment[] = ["BARBELL", "EZ_BAR", "TRAP_BAR", "SMITH_MACHINE"];

/** Bar types that have a per-exercise "bar and plates" profile (D1). Smith machines use their machine profile instead. */
export const BAR_PROFILE_EQUIPMENT: readonly Equipment[] = ["BARBELL", "EZ_BAR", "TRAP_BAR"];

export const isBarProfileExercise = (exercise: Pick<ExerciseRow, "equipment" | "loadType">): boolean => BAR_PROFILE_EQUIPMENT.includes(exercise.equipment) && exercise.loadType === "TOTAL";

/**
 * The picture for an exercise (spec section 06): a cable column for cables, a dip belt for bodyweight-plus, a held plate, a
 * medicine ball; null when there is none (bands, strongman kit, ...).
 */
export function pictureKind(exercise: Pick<ExerciseRow, "equipment" | "loadType">): PictureKind | null {
  const { equipment, loadType } = exercise;
  if (equipment === "KETTLEBELL") return "kettlebell";
  if (equipment === "DUMBBELL") return "dumbbell";
  if (BAR_EQUIPMENT.includes(equipment) && loadType === "TOTAL") return "bar";
  if (equipment === "MACHINE_PLATE_LOADED" || loadType === "PLATES_PER_SIDE") return "horn";
  if (equipment === "CABLE") return "cable";
  if (loadType === "STACK") return "stack";
  if (loadType === "BODYWEIGHT_PLUS") return "belt";
  if (equipment === "PLATE") return "plate";
  if (equipment === "MEDICINE_BALL") return "medicine-ball";
  return null;
}

/** Kinds drawn as a weight stack, where the dial's value sits on a pin. */
export const isStackKind = (kind: PictureKind | null): kind is "stack" | "cable" => kind === "stack" || kind === "cable";

/** Plates shown on a weight stack's drawing. The stack's real size is not stored, so the picture shows a window. */
export const STACK_WINDOW = 20;
/** The first stack plate drawn: the window scrolls so the pin stays 3 plates from the bottom once it passes plate 17. */
export const stackFirstPlate = (pin: number): number => Math.max(1, pin - (STACK_WINDOW - 4));

export interface DialSetup {
  kind: PictureKind | null;
  unit: WeightUnit;
  step: number;
  /** Bar weight (bars), carriage weight (plate-loaded) or base load (stack, pin 1); null when unknown. */
  bar: number | null;
  plates: readonly Plate[];
  /** Every value the dial offers, ascending. */
  values: number[];
  /** Where the dial points while the value is null. */
  restIndex: number;
  /** The value at `restIndex` (what the picture shows, faded, for a set with no weight). */
  restValue: number;
  /** Top of the dial's range. */
  max: number;
}

export interface DialSetupInput {
  exercise: DialExercise;
  unit: WeightUnit;
  /** Dial step in `unit` (weightStep()). */
  step: number;
  /** The set's current weight in `unit`, inserted into the dial values when off-step. */
  current: number | null;
  /** The chosen machine profile, or the exercise's bar profile. */
  machine: DialMachine | null;
  /** The user's gear profile for this exercise's equipment (dumbbell step or kettlebells owned); null = the defaults. */
  gear?: DialGear | null;
}

const nearestIndex = (values: readonly number[], v: number): number => {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs((values[i] as number) - v) < Math.abs((values[best] as number) - v)) best = i;
  return best;
};

export function dialSetup({ exercise, unit, step: defaultStep, current, machine, gear = null }: DialSetupInput): DialSetup {
  const kind = pictureKind(exercise);
  // Gear is stored in kg; the dial works in the row's unit.
  const dumbbellStep = kind === "dumbbell" && gear?.pinStepKg != null && gear.pinStepKg > 0 ? fromKg(gear.pinStepKg, unit) : null;
  const bells = kind === "kettlebell" && gear?.platesKg && gear.platesKg.length > 0 ? gear.platesKg.map((kg) => fromKg(kg, unit)) : null;
  const step = dumbbellStep ?? defaultStep;
  const base = machine?.baseLoadKg != null ? fromKg(machine.baseLoadKg, unit) : null;
  const bar = kind === "bar" ? (base ?? DEFAULT_BAR_WEIGHT[exercise.equipment]?.[unit] ?? null) : isStackKind(kind) || kind === "horn" ? base : null;
  const plates = plateSet(unit, machine?.platesKg ?? null);
  let values = dialValues({ equipment: exercise.equipment, loadType: exercise.loadType, unit, step, current, bar, plates, bells, dumbbellStep });
  if (exercise.loadType === "BODYWEIGHT_PLUS" && !values.includes(0)) values = [0, ...values];
  if (values.length === 0) values = [current ?? 0];
  let restIndex = 0;
  if (kind === "dumbbell") restIndex = nearestIndex(values, unit === "KG" ? 10 : fromKg(10, unit));
  else if (kind === "kettlebell") restIndex = nearestIndex(values, KETTLEBELL_SIZES[unit][KETTLEBELL_SIZES.KG.indexOf(16)] as number);
  const max = DIAL_MAX_FOR[kind ?? "other"][unit];
  return { kind, unit, step, bar, plates, values, restIndex, restValue: values[restIndex] as number, max };
}

const DIAL_MAX_FOR: Record<PictureKind | "other", Record<WeightUnit, number>> = {
  bar: DIAL_MAX.bar,
  horn: DIAL_MAX.side,
  dumbbell: DIAL_MAX.dumbbell,
  kettlebell: DIAL_MAX.other,
  stack: DIAL_MAX.stack,
  cable: DIAL_MAX.stack,
  belt: DIAL_MAX.other,
  plate: DIAL_MAX.other,
  "medicine-ball": DIAL_MAX.other,
  other: DIAL_MAX.other,
};

/** The stack pin a value sits on (spec: round((value - base) / step) + 1 with a base load, else round(value / step)). */
export const pinOf = (value: number, setup: Pick<DialSetup, "step" | "bar">): number => pinFor(value, setup.step, setup.bar);

/** Rim and ink token names for the dial: a barbell takes the tone of its heaviest plate (steel when empty), the rest use primary. */
export function dialColors(kind: PictureKind | null, heaviest: PlateTone | null): { rim?: string; ink?: string } {
  if (kind !== "bar") return {};
  if (heaviest === null) return { rim: "steel", ink: "plate-ink-dark" };
  return { rim: `plate-${heaviest}`, ink: PLATE_INK_DARK.has(heaviest) ? "plate-ink-dark" : "plate-ink-light" };
}

/** Plate tones whose face is light enough to need dark ink (yellow, white and chrome). */
export const PLATE_INK_DARK: ReadonlySet<PlateTone> = new Set<PlateTone>(["yellow", "white", "chrome"]);
