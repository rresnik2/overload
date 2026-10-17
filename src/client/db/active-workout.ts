// A pointer to the active workout (meta key `activeWorkoutId`), so `repo.workouts.active()` is two key reads instead of reading every
// workout the user ever logged. `/workout` re-runs it on every Dexie write.
//
// IndexedDB cannot index `endedAt == null`, so the pointer is kept by hand: a Dexie hook on the workout table notes that a write
// transaction touched a workout row, and `writeTx` (every repo write and every sync apply goes through it) then recomputes the
// pointer once at the end of that transaction. Set writes (the common case) never touch the workout table, so they cost nothing.
//
// Values: a workout id, "" (none is active) or absent (unknown: an old database before migration 3, or an out-of-band write); readers
// fall back to the scan whenever the pointer is absent or points at something that is no longer an active workout.
import type { Transaction } from "dexie";
import type { WorkoutRow } from "@/contracts/entities";
import { META_KEYS, getMeta, setMeta, type OverloadDb } from "./schema";

const touched = new WeakSet<object>();

/** Called by OverloadDb for its workout table: remember that this transaction wrote a workout. */
export function noteWorkoutWrite(transaction: Transaction | undefined): void {
  if (transaction) touched.add(transaction);
}

/** True (once) when the transaction wrote a workout row. */
export function takeWorkoutWrite(transaction: Transaction | undefined): boolean {
  if (!transaction || !touched.has(transaction)) return false;
  touched.delete(transaction);
  return true;
}

const isActive = (w: WorkoutRow): boolean => !w.deletedAt && w.endedAt == null;

/** The newest started workout that is alive and not ended, found by walking newest first (it stops at the first hit). */
export function scanActiveWorkout(db: OverloadDb): Promise<WorkoutRow | undefined> {
  return db.workout.orderBy("startedAt").reverse().filter(isActive).first();
}

/** Recompute the pointer. Call inside a read-write transaction. */
export async function refreshActivePointer(db: OverloadDb): Promise<void> {
  const found = await scanActiveWorkout(db);
  await setMeta(db, META_KEYS.activeWorkout, found?.id ?? "");
}

/** The active workout through the pointer, with the scan as the fallback. Safe in a read-only transaction (it never writes). */
export async function readActiveWorkout(db: OverloadDb): Promise<WorkoutRow | undefined> {
  const pointer = await getMeta<string>(db, META_KEYS.activeWorkout);
  if (pointer === "") return undefined;
  if (pointer) {
    const row = await db.workout.get(pointer);
    if (row && isActive(row)) return row;
  }
  return scanActiveWorkout(db);
}
