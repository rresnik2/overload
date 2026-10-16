"use client";
import { CircleHelp, MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { repo } from "@/client/repo";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal, Sheet } from "@/components/ui/Sheet";
import type { WorkoutRow, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import { isGearEquipment } from "@/client/repo/gear";
import { setWorkoutActive } from "@/lib/pwa";
import { useWorkoutActions } from "./actions";
import { ElapsedClock } from "./ElapsedClock";
import { ExerciseBlock } from "./ExerciseBlock";
import { ExercisePicker } from "./ExercisePicker";
import { ExerciseTab } from "./ExerciseTab";
import { LoggingGuide, useLoggingGuide } from "./LoggingGuide";
import { useRestTimer, useWakeLock } from "./hooks";
import { MachineChooser } from "./MachineChooser";
import { MachineProfileForm } from "./MachineProfileForm";
import { useWorkoutPrefs } from "./prefs";
import { headlinePr } from "./prs";
import { RestTimer } from "./RestTimer";
import { addExerciseToWorkout, discardWorkout, supersetLabels } from "./session";
import { useActiveWorkoutView } from "./useWorkoutView";
import { summarizeWorkout, type ExerciseView, type WorkoutSummary } from "./view";

export interface ActiveWorkoutProps {
  workout: WorkoutRow;
  /** Open the finish sheet with the current summary. */
  onFinish: (summary: WorkoutSummary) => void;
  onSaveTemplate: (workoutId: string) => void;
  onDiscarded: () => void;
}

const NO_EXERCISES: ExerciseView[] = [];
const NO_PRS = new Map<string, PrCandidate[]>();

/** The workout in progress: set rows, rest timer, add exercise, finish. Reads and writes only through Dexie. */
export function ActiveWorkout({ workout, onFinish, onSaveTemplate, onDiscarded }: ActiveWorkoutProps) {
  const prefs = useWorkoutPrefs();
  const view = useActiveWorkoutView(workout.id);
  const rest = useRestTimer(workout.id);
  const [picking, setPicking] = useState(false);
  const [changing, setChanging] = useState<ExerciseView | null>(null);
  const [editingBar, setEditingBar] = useState<ExerciseView | null>(null);
  // The gear sheet (dumbbell step or kettlebells owned): the same kind of sheet as the bar one, for the exercise's equipment.
  const [editingGear, setEditingGear] = useState<ExerciseView | null>(null);
  // Phones show the dial panel for one exercise at a time: the one the lifter tapped, else the first with a set still to do.
  const [focus, setFocus] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [title, setTitle] = useState<string | null>(null);
  const guide = useLoggingGuide();

  useWakeLock(true);
  useEffect(() => {
    setWorkoutActive(true);
    const id = window.setInterval(() => setWorkoutActive(true), 10 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const exercises = view?.exercises ?? NO_EXERCISES;
  const startRest = rest.start;
  const onSetCompleted = useCallback((_set: WorkoutSetRow, item: ExerciseView) => startRest(item.we.restSec ?? prefs.defaultRestSec), [startRest, prefs.defaultRestSec]);
  const actionsFor = useWorkoutActions({ workoutId: workout.id, prefs, exercises, onSetCompleted, onChangeMachine: setChanging, onEditBar: setEditingBar, onEditGear: setEditingGear });
  const focusedId = (exercises.find((e) => e.we.id === focus) ?? exercises.find((e) => e.sets.some((s) => s.completedAt == null)))?.we.id ?? null;
  const labels = useMemo(() => supersetLabels(exercises.map((e) => e.we)), [exercises]);
  const tabItems = useMemo(() => exercises.map((e) => ({ id: e.we.id, name: e.exercise.name, done: e.sets.filter((x) => x.completedAt != null).length, total: e.sets.length })), [exercises]);
  // One callback for every block (they pass their own id), so the blocks' props stay equal between renders.
  const focusExercise = useCallback((id: string) => setFocus(id), []);
  const advanceExercise = useCallback((_id: string, allDone: boolean) => {
    if (allDone) setFocus(null);
  }, []);
  const focusedIndex = focusedId ? exercises.findIndex((e) => e.we.id === focusedId) : -1;

  // Phones: the exercise tab moves the dial panel to the next, previous or chosen exercise in workout order.
  const goTo = (index: number) => {
    const target = exercises[index];
    if (target && index !== focusedIndex) setFocus(target.we.id);
  };

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
          <ElapsedClock className="wk-bar__clock num" ariaLabel="Elapsed time" testId="elapsed" startedAt={workout.startedAt} />
        </div>
        <button type="button" className="wk-icon-btn" aria-label="How logging works" aria-expanded={guide.open} onClick={guide.toggle}>
          <CircleHelp size={20} aria-hidden="true" />
        </button>
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
        <Button
          onClick={() => {
            if (!view) return;
            const prs = new Map<string, PrCandidate[]>();
            for (const own of view.prsByExercise.values()) for (const [id, list] of own) prs.set(id, list);
            onFinish(summarizeWorkout({ workout: view.workout, exercises: view.exercises, prs }, Date.now(), headlinePr));
          }}
          disabled={!view}
        >
          Finish
        </Button>
      </div>

      {guide.open ? <LoggingGuide onClose={guide.close} /> : null}

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
              prs={view.prsByExercise.get(item.we.id) ?? NO_PRS}
              actions={actionsFor(item)}
              supersetLabel={labels.get(item.we.id)}
              canMoveUp={i > 0}
              canMoveDown={i < exercises.length - 1}
              canLinkNext={i < exercises.length - 1}
              panel
              focused={focusedId === item.we.id}
              onFocus={focusExercise}
              onAdvance={advanceExercise}
              bodyweightKg={view.workout.bodyweightKg}
            />
          ))}
          <Button variant="ink" block icon={<Plus size={18} />} onClick={() => setPicking(true)}>
            Add exercise
          </Button>
          <ExerciseTab items={tabItems} index={focusedIndex} onGo={goTo} />
        </>
      )}

      <RestTimer state={rest.state} defaultSec={prefs.defaultRestSec} start={rest.start} pause={rest.pause} resume={rest.resume} adjust={rest.adjust} clear={rest.clear} />

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

      <Sheet open={editingBar !== null} onClose={() => setEditingBar(null)} title="Bar and plates">
        {editingBar ? (
          <MachineProfileForm
            key={editingBar.exercise.id}
            kind="bar"
            initial={editingBar.barProfile ?? undefined}
            unit={prefs.unit}
            exerciseId={editingBar.exercise.id}
            defaultName={`${editingBar.exercise.name} bar`}
            submitLabel="Save bar and plates"
            onCancel={() => setEditingBar(null)}
            onSave={async (fields) => {
              if (editingBar.barProfile) await repo.machineProfiles.update(editingBar.barProfile.id, fields);
              else await repo.machineProfiles.create(fields);
              setEditingBar(null);
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={editingGear !== null} onClose={() => setEditingGear(null)} title={editingGear?.exercise.equipment === "KETTLEBELL" ? "Kettlebells" : "Dumbbells"}>
        {editingGear && isGearEquipment(editingGear.exercise.equipment) ? (
          <MachineProfileForm
            key={editingGear.exercise.equipment}
            kind={editingGear.exercise.equipment === "KETTLEBELL" ? "kettlebells" : "dumbbells"}
            initial={editingGear.gear ?? undefined}
            unit={prefs.unit}
            onCancel={() => setEditingGear(null)}
            onSave={async (fields) => {
              // The first save creates the user-wide gear profile; later saves update it.
              if (editingGear.gear) await repo.machineProfiles.update(editingGear.gear.id, fields);
              else await repo.machineProfiles.create(fields);
              setEditingGear(null);
            }}
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
