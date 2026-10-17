"use client";
// The write handlers behind the exercise blocks (live workout and history edits). Every write goes through `repo`
// (Dexie + outbox), so all of them work offline. Failures surface as an error toast instead of throwing into React.
import { useCallback, useEffect, useMemo, useRef } from "react";
import { repo } from "@/client/repo";
import { useToast } from "@/components/ui/Toast";
import type { WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import type { ExerciseBlockActions } from "./ExerciseBlock";
import type { WorkoutPrefs } from "./prefs";
import { describePr, headlinePr, seriesHistory, workoutPrs } from "./prs";
import { addSet, completionPatch, movedPosition, supersetPatches } from "./session";
import type { ExerciseView } from "./view";

/** PRs already announced on this page (live toast or sync result), so each shows once. */
const announced = new Set<string>();
export const prKey = (c: Pick<PrCandidate, "seriesKey" | "type" | "reps" | "value">) => `${c.seriesKey}|${c.type}|${c.reps}|${c.value}`;
export const markAnnounced = (c: Parameters<typeof prKey>[0]) => announced.add(prKey(c));
export const wasAnnounced = (c: Parameters<typeof prKey>[0]) => announced.has(prKey(c));

export interface WorkoutActionOptions {
  workoutId: string;
  prefs: WorkoutPrefs;
  exercises: ExerciseView[];
  /** Live workout: completing a set starts the rest timer. History edits leave it undefined. */
  onSetCompleted?: (set: WorkoutSetRow, item: ExerciseView) => void;
  /** History edits: added sets are born completed, at this instant. */
  completeNewSetsAt?: string;
  onChangeMachine?: (item: ExerciseView) => void;
  /** Live workout: open the "Bar and plates" sheet for a barbell exercise. */
  onEditBar?: (item: ExerciseView) => void;
  /** Live workout: open the gear sheet (dumbbell step or kettlebells owned) for a dumbbell or kettlebell exercise. */
  onEditGear?: (item: ExerciseView) => void;
}

/**
 * The handlers of every exercise block. `actionsFor(item)` returns the SAME object for an exercise for as long as it stays in the
 * workout, however often the data or the callbacks passed in change: the handlers read the latest exercises, preferences and
 * callbacks through a ref when they run. That identity is what lets `memo(ExerciseBlock)` skip renders.
 */
export function useWorkoutActions(options: WorkoutActionOptions) {
  const { toast } = useToast();
  // The newest inputs, read when a handler runs (never while rendering).
  const latest = useRef({ options, toast });
  useEffect(() => {
    latest.current = { options, toast };
  });

  // Which optional handlers this screen has (history edits have none of the sheets).
  const hasMachine = Boolean(options.onChangeMachine);
  const hasBar = Boolean(options.onEditBar);
  const hasGear = Boolean(options.onEditGear);

  const buildActions = useCallback((exerciseId: string): ExerciseBlockActions => {
    /** The exercise as of now (a handler may run a render later than the one that created it). */
    const current = (): ExerciseView | undefined => latest.current.options.exercises.find((e) => e.we.id === exerciseId);
    const open = (pick: (o: WorkoutActionOptions) => ((item: ExerciseView) => void) | undefined) => {
      const item = current();
      if (item) pick(latest.current.options)?.(item);
    };
    const guard = async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        latest.current.toast({ kind: "error", title: "Could not save", description: error instanceof Error ? error.message : "Try again." });
      }
    };
    const announcePrs = async (set: WorkoutSetRow, item: ExerciseView) => {
      const { options: o, toast: say } = latest.current;
      const history = await seriesHistory([set.seriesKey]);
      const prs = workoutPrs(history, o.workoutId).get(set.id);
      const fresh = prs?.filter((c) => !wasAnnounced(c));
      if (!fresh || fresh.length === 0) return;
      for (const c of fresh) markAnnounced(c);
      const headline = headlinePr(fresh);
      if (headline) say({ kind: "pr", title: `New PR: ${item.exercise.name}`, description: describePr(headline, o.prefs.unit), duration: 6000 });
    };
    return {
      onSetChange: (set, patch: WorkoutSetPatch) => void guard(async () => void (await repo.sets.update(set.id, patch))),
      onToggleSet: (set, ghost) =>
        void guard(async () => {
          const item = current();
          if (!item) return;
          // Read the set again: a value committed a moment ago (a dial release, a flushed key press) is already stored, but the
          // row this handler was given is from the last render and would put the "last time" value on top of it.
          const stored = (await repo.sets.get(set.id)) ?? set;
          if (stored.completedAt != null) {
            await repo.sets.update(set.id, { completedAt: null });
            return;
          }
          const result = completionPatch(stored, item.exercise, ghost, new Date());
          if (!result.ok) {
            latest.current.toast({ kind: "error", title: result.error });
            return;
          }
          const updated = await repo.sets.update(set.id, result.patch);
          latest.current.options.onSetCompleted?.(updated, item);
          await announcePrs(updated, item);
        }),
      onDeleteSet: (set) => void guard(() => repo.sets.remove(set.id)),
      onAddSet: () =>
        void guard(async () => {
          const { options: o } = latest.current;
          const item = current();
          if (item) await addSet(repo, item.we.id, { unit: o.prefs.unit, completedAt: o.completeNewSetsAt ?? null });
        }),
      onRemove: () => void guard(() => repo.workoutExercises.remove(exerciseId)),
      onMove: (direction) =>
        void guard(async () => {
          const position = movedPosition(latest.current.options.exercises.map((e) => e.we), exerciseId, direction);
          if (position) await repo.workoutExercises.update(exerciseId, { position });
        }),
      onSuperset: (mode) =>
        void guard(async () => {
          const patches = supersetPatches(latest.current.options.exercises.map((e) => e.we), exerciseId, mode);
          await repo.transact(async (tx) => {
            for (const p of patches) await tx.workoutExercises.update(p.id, { supersetKey: p.supersetKey });
          });
        }),
      onChangeMachine: hasMachine ? () => open((o) => o.onChangeMachine) : undefined,
      onEditBar: hasBar ? () => open((o) => o.onEditBar) : undefined,
      onEditGear: hasGear ? () => open((o) => o.onEditGear) : undefined,
    };
  }, [hasMachine, hasBar, hasGear]);

  // One actions object per exercise id; rebuilt only when exercises are added or removed.
  const ids = options.exercises.map((e) => e.we.id).join(",");
  const byId = useMemo(() => new Map((ids ? ids.split(",") : []).map((id) => [id, buildActions(id)] as const)), [ids, buildActions]);
  return useCallback((item: ExerciseView): ExerciseBlockActions => byId.get(item.we.id) ?? buildActions(item.we.id), [byId, buildActions]);
}
