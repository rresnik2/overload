// Catalog contracts (global exercise library). FROZEN after Phase 0. Owner of implementations: stream C.
import type {
  Equipment,
  ExerciseCategory,
  ExperienceLevel,
  Force,
  LoadType,
  Mechanic,
  Modality,
  StandardLift,
  TrackingType,
} from "./enums";
import type { ExerciseMuscleEntry, ExerciseRow, IsoDateTime } from "./entities";

/** One row of free-exercise-db `exercises.json` (Unlicense; vendored at prisma/data/free-exercise-db.json). */
export interface FreeExerciseDbRow {
  /** e.g. "Barbell_Squat". Stable; the catalog UUIDv5 is derived from it (catalogExerciseId in src/lib/ids.ts). */
  id: string;
  name: string;
  force: "push" | "pull" | "static" | null;
  /** NOTE: the dataset says "expert" where our ExperienceLevel says ADVANCED. */
  level: "beginner" | "intermediate" | "expert";
  mechanic: "compound" | "isolation" | null;
  /** "barbell" | "dumbbell" | "machine" | "cable" | "body only" | "e-z curl bar" | "kettlebells" | "bands" | "medicine ball" | "exercise ball" | "foam roll" | "other" | null */
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** "strength" | "stretching" | "plyometrics" | "strongman" | "powerlifting" | "cardio" | "olympic weightlifting" */
  category: string;
  /** Paths relative to the dataset's exercises/ folder, e.g. "3_4_Sit-Up/0.jpg" (see src/lib/catalog-images.ts). */
  images: string[];
}

/** Everything needed to build an Exercise row for a catalog exercise. Produced by `classify()` (stream C). */
export interface ExerciseClassification {
  sourceId: string;
  slug: string;
  name: string;
  aliases: string[];
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking: TrackingType;
  /** Fraction of bodyweight moved (e.g. push-up ~0.64, pull-up 1.0); null when not a bodyweight-loaded movement. */
  bodyweightFactor: number | null;
  isUnilateral: boolean;
  mechanic: Mechanic | null;
  force: Force | null;
  level: ExperienceLevel | null;
  category: ExerciseCategory;
  /** Only the barbell/bodyweight variants that define the standard lift (e.g. SQUAT = back squat), else null. */
  standardLift: StandardLift | null;
  instructions: string[];
  images: string[];
  muscles: ExerciseMuscleEntry[];
}

/** Signature of prisma/seed/classify.ts (stream C). Pure. */
export type ClassifyExercise = (source: FreeExerciseDbRow) => ExerciseClassification;

/** Signature of the hand-label table C maintains for overrides/tests (prisma/seed/overrides.json). */
export type ClassificationOverrides = Record<string, Partial<Omit<ExerciseClassification, "sourceId">>>;

/**
 * GET /api/catalog response. ETag: `W/"catalog-<version>"` (CatalogMeta.version); honour If-None-Match with 304.
 * Rows are global catalog exercises (isCustom: false, version 0, hlc "").
 */
export interface CatalogResponse {
  version: number;
  generatedAt: IsoDateTime;
  exercises: ExerciseRow[];
}

export function catalogEtag(version: number): string {
  return `W/"catalog-${version}"`;
}
