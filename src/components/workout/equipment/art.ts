// Which drawing an exercise gets: the equipment, its load type and, where the equipment alone is ambiguous (the cable attachment,
// the bodyweight apparatus, the strongman and cardio kit filed under OTHER), keywords in the name. PURE: no react, no DOM.
import type { Equipment, LoadType } from "@/contracts/enums";

/** The shaft between the collars: a straight bar, the EZ bar's cambers, the trap bar's hexagon, a Smith bar on its rails, a thick axle or a log. */
export type BarShape = "straight" | "ez" | "trap" | "smith" | "axle" | "log";

export type CableAttachment = "rope" | "d-handle" | "straight-bar" | "v-bar" | "lat-bar" | "ankle-strap";

export type ArtSpec =
  | { kind: "bar"; shape: BarShape }
  | { kind: "horn" }
  | { kind: "dumbbell" }
  | { kind: "kettlebell" }
  | { kind: "stack" }
  | { kind: "cable"; attachment: CableAttachment }
  | { kind: "belt" }
  | { kind: "plate" }
  | { kind: "medicine-ball" }
  | { kind: "sled" }
  | { kind: "farmer" }
  | {
      kind:
        | "pullup-bar"
        | "dip-bars"
        | "rings"
        | "straps"
        | "bench"
        | "box"
        | "mat"
        | "band"
        | "exercise-ball"
        | "foam-roller"
        | "stone"
        | "keg"
        | "sandbag"
        | "tire"
        | "yoke"
        | "battle-rope"
        | "jump-rope"
        | "treadmill"
        | "bike"
        | "rower"
        | "stairs"
        | "sledgehammer"
        | "heavy-bag"
        | "generic";
    };

export type ArtKind = ArtSpec["kind"];

/** Kinds whose drawing shows a weight: plates on a bar, a horn, a belt or a sled, a dumbbell or bell size, a pin, a plate or a ball. */
export const LOADED_KINDS: ReadonlySet<ArtKind> = new Set(["bar", "horn", "dumbbell", "kettlebell", "stack", "cable", "belt", "plate", "medicine-ball", "sled", "farmer"]);

export interface ArtExercise {
  equipment: Equipment;
  loadType: LoadType;
  name: string;
}

const has = (name: string, re: RegExp) => re.test(name);

function cableAttachment(name: string): CableAttachment {
  if (has(name, /\brope\b|face pull|pull through|crunch/i)) return "rope";
  if (has(name, /v-bar|close-grip|close grip|seated cable rows?|elevated cable rows?|seated .*rows?$/i)) return "v-bar";
  if (has(name, /kickback|hip (ad|ab)duction|ankle/i)) return "ankle-strap";
  if (has(name, /one[- ]arm|single[- ]arm|one[- ]legged/i)) return "d-handle";
  if (has(name, /pulldown|pull-down/i) && !has(name, /straight-arm/i)) return "lat-bar";
  if (has(name, /pushdown|curl|upright|shrug|straight-arm|preacher|bar\b/i)) return "straight-bar";
  return "d-handle";
}

/** The apparatus a bodyweight exercise is done on. Most are floor work and stretches: the mat. */
function bodyweightApparatus(name: string): ArtSpec {
  if (has(name, /stretch|\bfloor\b/i)) return { kind: "mat" };
  if (has(name, /\brings?\b/i)) return { kind: "rings" };
  if (has(name, /suspend|suspension|straps|\btrx\b/i)) return { kind: "straps" };
  if (has(name, /pull[- ]?ups?|chin|muscle.?up|hanging|\bhang\b|toes.to.bar|knees.to.elbows?|inverted row|mid row|rope climb/i)) return { kind: "pullup-bar" };
  if (has(name, /bench dips?/i)) return { kind: "bench" };
  if (has(name, /\bdips?\b/i)) return { kind: "dip-bars" };
  if (has(name, /\bbox\b|step-?ups?|depth jump|jump onto/i)) return { kind: "box" };
  if (has(name, /bench|hyperextension|glute.?ham|incline push|decline push|feet elevated/i)) return { kind: "bench" };
  return { kind: "mat" };
}

function otherEquipment(name: string): ArtSpec {
  if (has(name, /sledgehammer/i)) return { kind: "sledgehammer" };
  if (has(name, /sled|prowler|\bdrag\b/i)) return { kind: "sled" };
  if (has(name, /atlas|stone/i)) return { kind: "stone" };
  if (has(name, /\bkeg\b/i)) return { kind: "keg" };
  if (has(name, /sandbag/i)) return { kind: "sandbag" };
  if (has(name, /\btire\b|\btyre\b/i)) return { kind: "tire" };
  if (has(name, /\blog\b/i)) return { kind: "bar", shape: "log" };
  if (has(name, /\baxle\b/i)) return { kind: "bar", shape: "axle" };
  if (has(name, /\byoke\b/i)) return { kind: "yoke" };
  if (has(name, /farmer|rickshaw/i)) return { kind: "farmer" };
  if (has(name, /battl/i)) return { kind: "battle-rope" };
  if (has(name, /rope jump|jump rope|skipping/i)) return { kind: "jump-rope" };
  if (has(name, /treadmill|running|jogging|walking/i)) return { kind: "treadmill" };
  if (has(name, /bicycl|\bbike\b|elliptical/i)) return { kind: "bike" };
  if (has(name, /rowing|rower/i)) return { kind: "rower" };
  if (has(name, /stair|step mill/i)) return { kind: "stairs" };
  if (has(name, /heavy bag/i)) return { kind: "heavy-bag" };
  if (has(name, /skating/i)) return { kind: "mat" };
  return { kind: "generic" };
}

/** The bar a bar exercise uses, for the live picture in the active-set panel. */
export function barShapeFor(equipment: Equipment): BarShape {
  if (equipment === "EZ_BAR") return "ez";
  if (equipment === "TRAP_BAR") return "trap";
  if (equipment === "SMITH_MACHINE") return "smith";
  return "straight";
}

/** The drawing for an exercise. Every exercise gets one; `generic` is the last resort. */
export function artFor({ equipment, loadType, name }: ArtExercise): ArtSpec {
  switch (equipment) {
    case "BARBELL":
      return { kind: "bar", shape: "straight" };
    case "EZ_BAR":
      return { kind: "bar", shape: "ez" };
    case "TRAP_BAR":
      return { kind: "bar", shape: "trap" };
    case "SMITH_MACHINE":
      return { kind: "bar", shape: "smith" };
    case "MACHINE_PLATE_LOADED":
      return { kind: "horn" };
    case "MACHINE_SELECTORIZED":
      return { kind: "stack" };
    case "CABLE":
      return { kind: "cable", attachment: cableAttachment(name) };
    case "DUMBBELL":
      return { kind: "dumbbell" };
    case "KETTLEBELL":
      return { kind: "kettlebell" };
    case "PLATE":
      return { kind: "plate" };
    case "MEDICINE_BALL":
      return { kind: "medicine-ball" };
    case "EXERCISE_BALL":
      return { kind: "exercise-ball" };
    case "FOAM_ROLL":
      return { kind: "foam-roller" };
    case "BAND":
      return { kind: "band" };
    case "BODYWEIGHT":
      return loadType === "BODYWEIGHT_PLUS" ? { kind: "belt" } : bodyweightApparatus(name);
    case "OTHER":
      return otherEquipment(name);
  }
}

/**
 * A bodyweight-plus exercise with nothing added draws its apparatus (the pull-up bar, the dip bars), not an empty belt.
 * `added` is the extra load in the display unit (null: none logged).
 */
export function resolveBelt(spec: ArtSpec, exercise: ArtExercise, added: number | null): ArtSpec {
  if (spec.kind !== "belt" || (added !== null && added > 0)) return spec;
  return bodyweightApparatus(exercise.name);
}
