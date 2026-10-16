"use client";
// The write handlers behind the exercise blocks (live workout and history edits). Every write goes through `repo`
// (Dexie + outbox), so all of them work offline. Failures surface as an error toast instead of throwing into React.
import { useCallback, useMemo } from "react";
import { repo } from "@/client/repo";
import { useToast } from "@/components/ui/Toast";
import type { WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import type { WeightUnit } from "@/contracts/enums";
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
}

export function useWorkoutActions({ workoutId, prefs, exercises, onSetCompleted, completeNewSetsAt, onChangeMachine, onEditBar }: WorkoutActionOptions) {
  const { toast } = useToast();
  const unit: WeightUnit = prefs.unit;

  const guard = useCallback(
    async (fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        toast({ kind: "error", title: "Could not save", description: error instanceof Error ? error.message : "Try again." });
      }
    },
    [toast],
  );

  const announcePrs = useCallback(
    async (set: WorkoutSetRow, item: ExerciseView) => {
      const history = await seriesHistory([set.seriesKey]);
      const prs = workoutPrs(history, workoutId).get(set.id);
      const fresh = prs?.filter((c) => !wasAnnounced(c));
      if (!fresh || fresh.length === 0) return;
      for (const c of fresh) markAnnounced(c);
      const headline = headlinePr(fresh);
      if (headline) toast({ kind: "pr", title: `New PR: ${item.exercise.name}`, description: describePr(headline, prefs.unit), duration: 6000 });
    },
    [prefs.unit, toast, workoutId],
  );

  return useMemo(() => {
    return (item: ExerciseView): ExerciseBlockActions => ({
      onSetChange: (set, patch: WorkoutSetPatch) => void guard(async () => void (await repo.sets.update(set.id, patch))),
      onToggleSet: (set, ghost) =>
        void guard(async () => {
          if (set.completedAt != null) {
            await repo.sets.update(set.id, { completedAt: null });
            return;
          }
          const result = completionPatch(set, item.exercise, ghost, new Date());
          if (!result.ok) {
            toast({ kind: "error", title: result.error });
            return;
          }
          const updated = await repo.sets.update(set.id, result.patch);
          onSetCompleted?.(updated, item);
          await announcePrs(updated, item);
        }),
      onDeleteSet: (set) => void guard(() => repo.sets.remove(set.id)),
      onAddSet: () => void guard(async () => void (await addSet(repo, item.we.id, { unit, completedAt: completeNewSetsAt ?? null }))),
      onRemove: () => void guard(() => repo.workoutExercises.remove(item.we.id)),
      onMove: (direction) =>
        void guard(async () => {
          const position = movedPosition(exercises.map((e) => e.we), item.we.id, direction);
          if (position) await repo.workoutExercises.update(item.we.id, { position });
        }),
      onSuperset: (mode) =>
        void guard(async () => {
          const patches = supersetPatches(exercises.map((e) => e.we), item.we.id, mode);
          await repo.transact(async (tx) => {
            for (const p of patches) await tx.workoutExercises.update(p.id, { supersetKey: p.supersetKey });
          });
        }),
      onChangeMachine: onChangeMachine ? () => onChangeMachine(item) : undefined,
      onEditBar: onEditBar ? () => onEditBar(item) : undefined,
    });
  }, [guard, toast, announcePrs, onSetCompleted, unit, completeNewSetsAt, exercises, onChangeMachine, onEditBar]);
}
