// Pure classifier: one free-exercise-db row -> modality, equipment, load type, tracking, unilateral, bodyweight factor,
// standard lift, muscles. Runs in the seed and in tests; imports nothing from the app.
//
// Principle: machine and free-weight exercises are never mixed. MACHINE / CABLE modality is decided by the dataset's
// `equipment` (and the name for Smith-machine rows filed under barbell); a FREE_WEIGHT row never has a machine equipment.
// Rules cover the bulk of the rows; the remainder are hand-labelled in overrides.json (ClassificationOverrides).
import type { ClassificationOverrides, ClassifyExercise, ExerciseClassification, FreeExerciseDbRow } from "@/contracts/catalog";
import type {
  Equipment,
  ExerciseCategory,
  ExperienceLevel,
  Force,
  LoadType,
  Mechanic,
  Modality,
  Muscle,
  StandardLift,
  TrackingType,
} from "@/contracts/enums";
import type { ExerciseMuscleEntry } from "@/contracts/entities";
import { slugify } from "@/lib/ids";
import overridesJson from "./overrides.json";

const OVERRIDES = overridesJson as unknown as ClassificationOverrides;

const MUSCLE: Record<string, Muscle> = {
  abdominals: "ABDOMINALS",
  abductors: "ABDUCTORS",
  adductors: "ADDUCTORS",
  biceps: "BICEPS",
  calves: "CALVES",
  chest: "CHEST",
  forearms: "FOREARMS",
  glutes: "GLUTES",
  hamstrings: "HAMSTRINGS",
  lats: "LATS",
  "lower back": "LOWER_BACK",
  "middle back": "MIDDLE_BACK",
  neck: "NECK",
  quadriceps: "QUADRICEPS",
  shoulders: "SHOULDERS",
  traps: "TRAPS",
  triceps: "TRICEPS",
};
const LEVEL: Record<string, ExperienceLevel> = { beginner: "BEGINNER", intermediate: "INTERMEDIATE", expert: "ADVANCED" };
const MECHANIC: Record<string, Mechanic> = { compound: "COMPOUND", isolation: "ISOLATION" };
const FORCE: Record<string, Force> = { push: "PUSH", pull: "PULL", static: "STATIC" };
const CATEGORY: Record<string, ExerciseCategory> = {
  strength: "STRENGTH",
  stretching: "STRETCHING",
  plyometrics: "PLYOMETRICS",
  strongman: "STRONGMAN",
  powerlifting: "POWERLIFTING",
  cardio: "CARDIO",
  "olympic weightlifting": "OLYMPIC_WEIGHTLIFTING",
};

/** The one canonical exercise per standard lift (never a machine). Series stay comparable across users and time. */
const STANDARD_LIFTS: Record<string, StandardLift> = {
  Barbell_Squat: "SQUAT",
  "Barbell_Bench_Press_-_Medium_Grip": "BENCH_PRESS",
  Barbell_Deadlift: "DEADLIFT",
  Standing_Military_Press: "OVERHEAD_PRESS",
  Bent_Over_Barbell_Row: "BARBELL_ROW",
  Pullups: "PULL_UP",
  "Dips_-_Triceps_Version": "DIP",
};

interface Core {
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  isUnilateral: boolean;
}

/** Lower-cased, separators collapsed to single spaces: "Rocky_Pull-Ups_Pulldowns" -> "rocky pull ups pulldowns". */
const norm = (value: string): string => value.toLowerCase().replace(/[-_\s]+/g, " ").trim();

const UNILATERAL = /\b(one (arm|armed|leg|legged|handed|hand)|single (arm|leg)|unilateral|1 arm)\b/;
const SMITH = /\bsmith\b/;
const PLATE_LOADED_MACHINE = /\b(leverage|hack squats?|leg press|lying machine squat|t bar|reverse hyperextension)\b/;
const BAND_RESISTED = /\b(band assisted|seated band|sit ups with bands)\b/;
const PULL_UP_FAMILY = /\b(pull ?ups?|chin ?ups?|chins?|muscle up|rope climb|sternum chins|rocky pull ups)\b|\bbodyweight mid row\b/;
/** Bodyweight-style movements filed under "other": pull-up bar, rings, parallel bars, suspension trainers, rope climbs. */
const BODYWEIGHT_APPARATUS =
  /\b(pull ?ups?|chin ?ups?|chins?|dips?|muscle up|rope climb|suspended|inverted row|bodyweight|parallel bars?|otis up|london bridges|hang|crucifix|sternum chins|balance board|ab roller|platform hamstring slides|hyperextensions|donkey calf raises|single leg high box squat|wrist roller|weighted squat|overhead lat)\b/;
const STRONGMAN_MOVING = /\b(carry|walk|drags?|push|sprint|climb|prowler)\b/;

function modalityFor(source: FreeExerciseDbRow): Core {
  const key = norm(source.id);
  const eq = source.equipment;
  const isUnilateral = UNILATERAL.test(key);
  const base = { isUnilateral };

  // Smith machine rows are filed under "machine" (and one under "barbell"): always the Smith machine, bar + plates.
  if (SMITH.test(key)) return { modality: "MACHINE", equipment: "SMITH_MACHINE", loadType: "TOTAL", ...base };

  switch (eq) {
    case "machine":
      if (source.category === "cardio") return { modality: "MACHINE", equipment: "OTHER", loadType: "NONE", ...base };
      if (PLATE_LOADED_MACHINE.test(key)) {
        return { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE", ...base };
      }
      return { modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK", ...base };
    case "cable":
      return { modality: "CABLE", equipment: "CABLE", loadType: "STACK", ...base };
    case "barbell":
      if (/\bez bar\b/.test(key)) return { modality: "FREE_WEIGHT", equipment: "EZ_BAR", loadType: "TOTAL", ...base };
      return { modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", ...base };
    case "e-z curl bar":
      return { modality: "FREE_WEIGHT", equipment: "EZ_BAR", loadType: "TOTAL", ...base };
    case "dumbbell":
      return implementLoad("DUMBBELL", source, isUnilateral);
    case "kettlebells":
      return implementLoad("KETTLEBELL", source, isUnilateral);
    case "bands":
      return { modality: "BAND", equipment: "BAND", loadType: "NONE", ...base };
    case "medicine ball":
      return { modality: "FREE_WEIGHT", equipment: "MEDICINE_BALL", loadType: "TOTAL", ...base };
    case "exercise ball":
      return { modality: "OTHER", equipment: "EXERCISE_BALL", loadType: "NONE", ...base };
    case "foam roll":
      return { modality: "OTHER", equipment: "FOAM_ROLL", loadType: "NONE", ...base };
    case "body only":
    case null:
      return { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "NONE", ...base };
    case "other":
      return otherEquipment(source, key, base);
    default:
      throw new Error(`classify: unknown equipment "${String(eq)}" on ${source.id}`);
  }
}

/** Dumbbell / kettlebell load semantics from the instructions: a pair (per implement), one held in both hands (total), or one in a single hand. */
function implementLoad(equipment: "DUMBBELL" | "KETTLEBELL", source: FreeExerciseDbRow, unilateralByName: boolean): Core {
  const steps = source.instructions.slice(0, 3).join(" ");
  const key = norm(source.id);
  const pair =
    /\b(two|2|pair of|both)\b[^.]{0,30}(dumbbells?|kettlebells?)|(dumbbells|kettlebells)\b|each (hand|arm)|in each|on each/i.test(steps) ||
    /\b(double|two dumbbell|two kettlebells?|with two)\b/.test(key);
  const bothHands = /both hands|two hands|by the (horns|head|ends)|with both|by both/i.test(steps);
  const free = { modality: "FREE_WEIGHT", equipment } as const;
  if (unilateralByName) return { ...free, loadType: "PER_IMPLEMENT", isUnilateral: true };
  if (pair) return { ...free, loadType: "PER_IMPLEMENT", isUnilateral: false };
  if (bothHands) return { ...free, loadType: "TOTAL", isUnilateral: false };
  // A single implement in one hand (e.g. "holding a kettlebell in your right hand"): the entry is per hand, nothing doubles.
  return { ...free, loadType: "PER_IMPLEMENT", isUnilateral: true };
}

function otherEquipment(source: FreeExerciseDbRow, key: string, base: { isUnilateral: boolean }): Core {
  if (/\b(trap bar|hex bar)\b/.test(key)) return { modality: "FREE_WEIGHT", equipment: "TRAP_BAR", loadType: "TOTAL", ...base };
  if (/ smr$/.test(key)) return { modality: "OTHER", equipment: "FOAM_ROLL", loadType: "NONE", ...base };
  if (BAND_RESISTED.test(key)) return { modality: "BAND", equipment: "BAND", loadType: "NONE", ...base };
  if (/\b(plate|svend press)\b/.test(key)) return { modality: "FREE_WEIGHT", equipment: "PLATE", loadType: "TOTAL", ...base };
  if (source.category === "strongman") {
    return { modality: "OTHER", equipment: "OTHER", loadType: STRONGMAN_MOVING.test(key) ? "NONE" : "TOTAL", ...base };
  }
  if (BODYWEIGHT_APPARATUS.test(key)) return { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "NONE", ...base };
  if (source.category === "stretching" || source.category === "plyometrics") {
    if (/\b(sledgehammer|battling ropes|heavy bag)\b/.test(key)) return { modality: "OTHER", equipment: "OTHER", loadType: "NONE", ...base };
    return { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "NONE", ...base };
  }
  return { modality: "OTHER", equipment: "OTHER", loadType: "NONE", ...base };
}

/** Fraction of bodyweight moved, for movements that can take added load (belt, vest, dumbbell between the feet). */
function bodyweightFactorFor(source: FreeExerciseDbRow, core: Core): number | null {
  if (core.modality !== "BODYWEIGHT" || source.category === "stretching" || source.category === "plyometrics") return null;
  const key = norm(source.id);
  if (/\b(scapular|isometric|plank|gorilla|crunch|assisted)\b/.test(key)) return null;
  if (PULL_UP_FAMILY.test(key)) return 1;
  if (/\bdips?\b/.test(key)) return /\bbench dips?\b/.test(key) ? 0.6 : 1;
  if (/\bhandstand\b/.test(key)) return 0.9;
  if (/\bpush ?ups?\b/.test(key) && !/\b(depth|plyo|kettlebell)\b/.test(key)) {
    if (/\bincline\b/.test(key)) return 0.41;
    if (/\b(decline|feet elevated)\b/.test(key)) return 0.74;
    return 0.64;
  }
  if (/\b(inverted row|suspended row)\b/.test(key)) return 0.5;
  return null;
}

function trackingFor(source: FreeExerciseDbRow, core: Core, factor: number | null): TrackingType {
  if (source.category === "cardio") return "DISTANCE_DURATION";
  if (source.category === "stretching") return "DURATION";
  const key = norm(source.id);
  if (core.equipment === "OTHER" && source.category === "strongman" && core.loadType === "NONE") return "DISTANCE_DURATION";
  if (/\b(plank|isometric|side bridge|stomach vacuum|one handed hang|wall sit|crucifix)\b/.test(key)) return "DURATION";
  if (core.loadType === "NONE" && factor === null) return "REPS";
  return "LOAD_REPS";
}

function musclesFor(source: FreeExerciseDbRow): ExerciseMuscleEntry[] {
  const seen = new Set<Muscle>();
  const out: ExerciseMuscleEntry[] = [];
  for (const [names, role] of [
    [source.primaryMuscles, "PRIMARY"],
    [source.secondaryMuscles, "SECONDARY"],
  ] as const) {
    for (const name of names) {
      const muscle = MUSCLE[name];
      if (!muscle) throw new Error(`classify: unknown muscle "${name}" on ${source.id}`);
      if (seen.has(muscle)) continue; // (exerciseId, muscle) is the primary key; PRIMARY wins
      seen.add(muscle);
      out.push({ muscle, role });
    }
  }
  return out;
}

/** The rules alone, without hand overrides (used by tests to show how much the overrides carry). */
export const classifyByRules: ClassifyExercise = (source) => {
  const core = modalityFor(source);
  const bodyweightFactor = bodyweightFactorFor(source, core);
  const loadType: LoadType = bodyweightFactor !== null ? "BODYWEIGHT_PLUS" : core.loadType;
  const tracking = trackingFor(source, { ...core, loadType }, bodyweightFactor);
  // Cardio and carries log distance/duration, stretches log duration, unloaded bodyweight logs reps: none of them carry a load.
  const unloaded = tracking === "DURATION" || tracking === "DISTANCE_DURATION" || tracking === "REPS";
  const finalLoadType: LoadType = unloaded && bodyweightFactor === null ? "NONE" : loadType;
  const standardLift = STANDARD_LIFTS[source.id] ?? null;
  return {
    sourceId: source.id,
    slug: slugify(source.name),
    name: source.name,
    aliases: [],
    modality: core.modality,
    equipment: core.equipment,
    loadType: finalLoadType,
    tracking,
    bodyweightFactor,
    isUnilateral: core.isUnilateral,
    mechanic: source.mechanic ? (MECHANIC[source.mechanic] ?? null) : null,
    force: source.force ? (FORCE[source.force] ?? null) : null,
    level: LEVEL[source.level] ?? null,
    category: CATEGORY[source.category] ?? "STRENGTH",
    standardLift,
    instructions: source.instructions,
    images: source.images,
    muscles: musclesFor(source),
  };
};

/** Source ids that have a hand override (for the seed report and tests). */
export const OVERRIDDEN_IDS: readonly string[] = Object.keys(OVERRIDES);

export const classify: ClassifyExercise = (source) => {
  const base = classifyByRules(source);
  const override = OVERRIDES[source.id];
  if (!override) return base;
  const merged: ExerciseClassification = { ...base, ...override, sourceId: source.id };
  // A bodyweight factor only makes sense with BODYWEIGHT_PLUS, and the reverse.
  if (merged.loadType !== "BODYWEIGHT_PLUS") merged.bodyweightFactor = null;
  return merged;
};
