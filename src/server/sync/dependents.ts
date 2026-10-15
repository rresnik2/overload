import "server-only";
// Re-derive WorkoutSet columns that depend on rows this batch changed but whose sets were NOT part of the batch:
//   workout (localDate, bodyweightKg) · workoutExercise (workoutId, exerciseId, machineProfileId) ·
//   machineProfile (baseLoadKg) · exercise (loadType, isUnilateral, bodyweightFactor) · bodyMetric (bodyweight fallback).
// Only sets whose derived columns actually change are rewritten (and re-versioned so other devices pull them).
import { dateToLocalDate, localDateToDate } from "@/lib/dates";
import type { Batch } from "./batch";
import { ADAPTERS } from "./entities";
import { num } from "@/server/mappers";

const DEPENDS = {
  workout: ["localDate", "bodyweightKg"],
  workoutExercise: ["workoutId", "exerciseId", "machineProfileId"],
  machineProfile: ["baseLoadKg"],
  exercise: ["loadType", "isUnilateral", "bodyweightFactor"],
} as const;

const idsChanging = (batch: Batch, entity: keyof typeof DEPENDS): string[] =>
  batch.touchedOf(entity).filter((t) => !t.isNew && DEPENDS[entity].some((f) => t.changed.has(f))).map((t) => t.id);

export async function rederiveDependentSets(batch: Batch): Promise<void> {
  const { tx, ctx } = batch;
  const clauses: Record<string, unknown>[] = [];
  const workouts = idsChanging(batch, "workout");
  const wes = idsChanging(batch, "workoutExercise");
  const machines = idsChanging(batch, "machineProfile");
  const exercises = idsChanging(batch, "exercise");
  if (workouts.length) clauses.push({ workoutId: { in: workouts } });
  if (wes.length) clauses.push({ workoutExerciseId: { in: wes } });
  if (machines.length) clauses.push({ machineProfileId: { in: machines } });
  if (exercises.length) clauses.push({ exerciseId: { in: exercises } });

  const metrics = batch.touchedOf("bodyMetric");
  if (metrics.length > 0) {
    const dates = metrics.map((t) => t.values.localDate as string).sort();
    clauses.push({
      localDate: { gte: localDateToDate(dates[0] as string) },
      exercise: { loadType: "BODYWEIGHT_PLUS" },
      workout: { bodyweightKg: null },
    });
  }
  if (clauses.length === 0) return;

  const skip = batch.touchedOf("workoutSet").map((t) => t.id);
  const sets = await tx.workoutSet.findMany({
    where: { userId: ctx.id, deletedAt: null, OR: clauses, ...(skip.length ? { id: { notIn: skip } } : {}) },
  });

  for (const set of sets) {
    const derived = await batch.deriver.derive({
      workoutExerciseId: set.workoutExerciseId,
      weightKg: num(set.weightKg),
      reps: set.reps,
      rir: num(set.rir),
    });
    if (!derived) continue;
    const same =
      derived.workoutId === set.workoutId &&
      derived.exerciseId === set.exerciseId &&
      derived.machineProfileId === set.machineProfileId &&
      derived.seriesKey === set.seriesKey &&
      derived.localDate === dateToLocalDate(set.localDate) &&
      derived.effectiveLoadKg === num(set.effectiveLoadKg) &&
      derived.e1rmKg === num(set.e1rmKg);
    if (same) continue;
    await ADAPTERS.workoutSet.delegate(tx).update({
      where: { id: set.id },
      data: {
        workoutId: derived.workoutId,
        exerciseId: derived.exerciseId,
        machineProfileId: derived.machineProfileId,
        seriesKey: derived.seriesKey,
        localDate: localDateToDate(derived.localDate),
        effectiveLoadKg: derived.effectiveLoadKg,
        e1rmKg: derived.e1rmKg,
        version: batch.nextVersion(),
      },
    });
    batch.seriesKeys.add(set.seriesKey);
    batch.seriesKeys.add(derived.seriesKey);
  }
}
