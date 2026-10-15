// Helpers for the client tests: isolated fake-indexeddb "devices" and row builders.
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { OverloadDb } from "@/client/db/schema";
import { createRepo } from "@/client/repo/repo";
import type { Repo } from "@/contracts/repo";

export interface TestDevice {
  db: OverloadDb;
  repo: Repo;
}

/** A device with its own isolated IndexedDB (so two devices of the same user can coexist in one process). */
export function newDevice(userId = "user-1"): TestDevice {
  const db = new OverloadDb(userId, { indexedDB: new IDBFactory(), IDBKeyRange });
  return { db, repo: createRepo(() => db) };
}

export const exerciseInput = (over: Record<string, unknown> = {}) => ({
  slug: "bench",
  name: "Bench Press",
  modality: "FREE_WEIGHT" as const,
  equipment: "BARBELL" as const,
  loadType: "TOTAL" as const,
  ...over,
});

export const workoutInput = (over: Record<string, unknown> = {}) => ({
  startedAt: "2026-10-12T17:00:00.000Z",
  localDate: "2026-10-12",
  timezone: "UTC",
  ...over,
});

/** exercise -> workout -> workoutExercise, ready for sets. */
export async function seedWorkout(repo: Repo, opts: { exercise?: Record<string, unknown>; workout?: Record<string, unknown> } = {}) {
  const exercise = await repo.exercises.create(exerciseInput(opts.exercise));
  const workout = await repo.workouts.create(workoutInput(opts.workout));
  const we = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: exercise.id, position: "a0" });
  return { exercise, workout, we };
}
