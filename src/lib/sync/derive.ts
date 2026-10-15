// WorkoutSet derived columns (pure). The server computes them on every apply (its values win); the client repo
// mirrors them locally with the same function so offline reads and "last time" lookups work.
import type { WorkoutSetDerived } from "@/contracts/entities";
import type { LoadType } from "@/contracts/enums";
import { estimate1RM } from "@/lib/analytics/e1rm";
import { effectiveLoadKg } from "@/lib/analytics/load";
import { seriesKey } from "@/lib/ids";

export interface DeriveSetInput {
  set: { weightKg: number | null; reps: number | null; rir: number | null };
  workoutExercise: { workoutId: string; exerciseId: string; machineProfileId: string | null };
  workout: { localDate: string; bodyweightKg: number | null };
  exercise: { loadType: LoadType; isUnilateral: boolean; bodyweightFactor: number | null };
  machineProfile: { baseLoadKg: number | null } | null;
  /** The latest BodyMetric weight, used for BODYWEIGHT_PLUS when the workout has no bodyweight of its own. */
  fallbackBodyweightKg: number | null;
}

/** workoutId / exerciseId / machineProfileId / seriesKey / localDate / effectiveLoadKg / e1rmKg of a set. */
export function deriveSetColumns(input: DeriveSetInput): WorkoutSetDerived {
  const { set, workoutExercise: we, workout, exercise, machineProfile } = input;
  const load = effectiveLoadKg({
    loadType: exercise.loadType,
    weightKg: set.weightKg,
    isUnilateral: exercise.isUnilateral,
    bodyweightKg: workout.bodyweightKg ?? input.fallbackBodyweightKg,
    bodyweightFactor: exercise.bodyweightFactor,
    baseLoadKg: machineProfile?.baseLoadKg ?? null,
  });
  // The stored e1RM always uses Epley (the default); analytics recompute with the user's formula from the raw sets.
  const e1rm =
    load != null && set.reps != null ? (estimate1RM({ weightKg: load, reps: set.reps, rir: set.rir })?.e1rmKg ?? null) : null;
  return {
    workoutId: we.workoutId,
    exerciseId: we.exerciseId,
    machineProfileId: we.machineProfileId,
    seriesKey: seriesKey(we.exerciseId, we.machineProfileId),
    localDate: workout.localDate,
    effectiveLoadKg: load,
    e1rmKg: e1rm,
  };
}
