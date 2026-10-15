"use client";
import { MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { repo, useLive } from "@/client/repo";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, Sheet } from "@/components/ui/Sheet";
import type { WorkoutRow, WorkoutSetRow } from "@/contracts/entities";
import { setWorkoutActive } from "@/lib/pwa";
import { useWorkoutActions } from "./actions";
import { ExerciseBlock } from "./ExerciseBlock";
import { ExercisePicker } from "./ExercisePicker";
import { useNow, useRestTimer, useWakeLock } from "./hooks";
import { formatClock } from "./labels";
import { MachineChooser } from "./MachineChooser";
import { useWorkoutPrefs } from "./prefs";
import { headlinePr } from "./prs";
import { RestTimer } from "./RestTimer";
import { addExerciseToWorkout, discardWorkout, supersetLabels } from "./session";
import { loadWorkoutView, summarizeWorkout, type ExerciseView, type WorkoutSummary } from "./view";

export interface ActiveWorkoutProps {
  workout: WorkoutRow;
  /** Open the finish sheet with the current summary. */
  onFinish: (summary: WorkoutSummary) => void;
  onSaveTemplate: (workoutId: string) => void;
  onDiscarded: () => void;
}

/** The workout in progress: set rows, rest timer, add exercise, finish. Reads and writes only through Dexie. */
export function ActiveWorkout({ workout, onFinish, onSaveTemplate, onDiscarded }: ActiveWorkoutProps) {
  const prefs = useWorkoutPrefs();
  const view = useLive(() => loadWorkoutView(repo, workout.id), [workout.id]);
  const rest = useRestTimer(workout.id);
  const now = useNow(1000);
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState<ExerciseView | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [title, setTitle] = useState<string | null>(null);

  useWakeLock(true);
  useEffect(() => {
    setWorkoutActive(true);
    const id = window.setInterval(() => setWorkoutActive(true), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const exercises = view?.exercises ?? [];
  const startRest = rest.start;
  const onSetCompleted = useCallback((_set: WorkoutSetRow, item: ExerciseView) => startRest(item.we.restSec ?? prefs.defaultRestSec), [startRest, prefs.defaultRestSec]);
  const actionsFor = useWorkoutActions({ workoutId: workout.id, prefs, exercises, onSetCompleted, onChangeMachine: setChanging });
  const labels = supersetLabels(exercises.map((e) => e.we));

  const saveTitle = async () => {
    if (title === null) return;
    const next = title.trim() || null;
    setTitle(null);
    if (next !== workout.title) await repo.workouts.update(workout.id, { title: next });
  };

  return (
    <div className="wk-active">
      <div className="wk-bar">
        <div className="wk-bar__title">
          <input
            className="wk-title-input"
            aria-label="Workout name"
            placeholder="Workout"
            value={title ?? workout.title ?? ""}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            maxLength={120}
          />
          <p className="wk-bar__clock num" aria-label="Elapsed time" data-testid="elapsed">
            {formatClock(now - new Date(workout.startedAt).getTime())}
          </p>
        </div>
        <details className="wk-menu wk-menu--right">
          <summary className="wk-icon-btn" aria-label="Workout options">
            <MoreHorizontal size={20} aria-hidden="true" />
          </summary>
          <div className="wk-menu__panel">
            <button type="button" onClick={() => onSaveTemplate(workout.id)}>
              Save as template
            </button>
            <button type="button" className="wk-menu__danger" onClick={() => setConfirmDiscard(true)}>
              Discard workout
            </button>
          </div>
        </details>
        <Button onClick={() => view && onFinish(summarizeWorkout(view, Date.now(), headlinePr))} disabled={!view}>
          Finish
        </Button>
      </div>

      {!view ? (
        <p className="wk-muted">Loading workout…</p>
      ) : exercises.length === 0 ? (
        <EmptyState title="No exercises yet" description="Add the first exercise to start logging sets." action={<Button onClick={() => setPicking(true)}>Add exercise</Button>} />
      ) : (
        <>
          {exercises.map((item, i) => (
            <ExerciseBlock
              key={item.we.id}
              item={item}
              prefs={prefs}
              prs={view.prs}
              actions={actionsFor(item)}
              supersetLabel={labels.get(item.we.id)}
              canMoveUp={i > 0}
              canMoveDown={i < exercises.length - 1}
              canLinkNext={i < exercises.length - 1}
            />
          ))}
          <Button variant="ink" block icon={<Plus size={18} />} onClick={() => setPicking(true)}>
            Add exercise
          </Button>
        </>
      )}

      <RestTimer
        status={rest.status}
        remainingMs={rest.remainingMs}
        durationSec={rest.state?.durationSec ?? prefs.defaultRestSec}
        onStart={rest.start}
        onPause={rest.pause}
        onResume={rest.resume}
        onAdjust={rest.adjust}
        onClear={rest.clear}
      />

      {picking ? (
        <ExercisePicker
          open
          onClose={() => setPicking(false)}
          unit={prefs.unit}
          onPick={async (exercise, machine) => {
            await addExerciseToWorkout(repo, { workoutId: workout.id, exercise, machineProfileId: machine?.id ?? null, unit: prefs.unit });
          }}
        />
      ) : null}

      <Sheet open={changing !== null} onClose={() => setChanging(null)} title="Change machine">
        {changing ? (
          <MachineChooser
            exercise={changing.exercise}
            unit={prefs.unit}
            confirmLabel="Use this machine"
            onChoose={async (machine) => {
              await repo.workoutExercises.update(changing.we.id, { machineProfileId: machine.id });
              setChanging(null);
            }}
            onBack={() => setChanging(null)}
          />
        ) : null}
      </Sheet>

      <Modal
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard this workout?"
        description="Every set you logged in it will be deleted."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await discardWorkout(repo, workout.id);
                rest.clear();
                setWorkoutActive(false);
                setConfirmDiscard(false);
                onDiscarded();
              }}
            >
              Discard workout
            </Button>
          </>
        }
      />
    </div>
  );
}
