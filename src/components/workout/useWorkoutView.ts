"use client";
// The live read model of the ACTIVE workout, in four independent pieces so that one set write re-reads one thing:
//   structure  the workout, its exercises, machines, bar profiles and gear   (live; set writes do not touch these tables)
//   sets       the workout's sets                                             (live; the only query a set write re-runs)
//   context    "last time" and the record history per progression series      (loaded, not live: see below)
//   prs        derived in memory from sets + history
// Every piece is structurally shared (`useStable`), so an exercise whose rows did not change keeps its object and `memo` skips it.
import { useEffect, useMemo, useState } from "react";
import { META_KEYS, getMeta, requireActiveDb } from "@/client/db";
import { repo, useLive } from "@/client/repo";
import type { WorkoutRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import { replaceEqualDeep } from "@/lib/structural";
import { useStable } from "./use-stable";
import { composeExercises, loadSeriesContext, loadWorkoutSets, loadWorkoutStructure, workoutPrsByExercise, type ExerciseView, type SeriesContext } from "./view";

export interface ActiveWorkoutView {
  workout: WorkoutRow;
  exercises: ExerciseView[];
  /** workout exercise id -> (setId -> records that set broke). A block receives only its own map. */
  prsByExercise: Map<string, Map<string, PrCandidate[]>>;
}

const EMPTY_LAST: SeriesContext["last"] = new Map();

/**
 * "Last time" and the record history do not change when a set of the current workout is written (they are other workouts), so they
 * are NOT a live query: a live query would re-run on every write to the same series. They load when the exercises change, when a sync
 * has just run (`syncedAt`) and when the tab comes back to the front.
 */
function useSeriesContext(workout: WorkoutRow | undefined, exercises: readonly { we: ExerciseView["we"] }[] | undefined, syncedAt: string | undefined): SeriesContext | null {
  const [context, setContext] = useState<SeriesContext | null>(null);
  const wes = useMemo(() => exercises?.map((e) => e.we), [exercises]);
  const workoutId = workout?.id;
  const localDate = workout?.localDate;
  useEffect(() => {
    if (!workoutId || !localDate || !wes) return;
    let cancelled = false;
    const load = () => {
      void loadSeriesContext(repo, { id: workoutId, localDate }, wes).then((next) => {
        if (!cancelled) setContext((prev) => replaceEqualDeep(prev, next));
      });
    };
    load();
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [workoutId, localDate, wes, syncedAt]);
  return context;
}

/** undefined while loading, null when the workout does not exist. */
export function useActiveWorkoutView(workoutId: string): ActiveWorkoutView | null | undefined {
  const structure = useStable(useLive(() => loadWorkoutStructure(repo, workoutId), [workoutId]));
  const sets = useStable(useLive(() => loadWorkoutSets(repo, workoutId), [workoutId]));
  const syncedAt = useLive(() => getMeta<string>(requireActiveDb(), META_KEYS.lastSyncedAt));
  const context = useSeriesContext(structure?.workout, structure?.exercises, syncedAt);

  const view = useMemo(() => {
    if (structure === undefined || sets === undefined) return undefined;
    if (structure === null) return null;
    const exercises = composeExercises(structure.exercises, sets, context?.last ?? EMPTY_LAST);
    // No records until the history has loaded: a first pass without it would flag every set as a record.
    const prsByExercise = context ? workoutPrsByExercise(exercises, context.history, workoutId) : new Map<string, Map<string, PrCandidate[]>>();
    return { workout: structure.workout, exercises, prsByExercise, ready: context !== null };
  }, [structure, sets, context, workoutId]);
  const stable = useStable(view);
  // Hold the screen on "Loading" until the history is in, so ghost values and record stars do not pop in a moment after the sets.
  return useMemo(() => (stable === null ? null : stable?.ready ? { workout: stable.workout, exercises: stable.exercises, prsByExercise: stable.prsByExercise } : undefined), [stable]);
}
