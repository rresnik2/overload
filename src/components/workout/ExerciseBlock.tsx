"use client";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Link2, Link2Off, MoreHorizontal, Plus, Repeat, Trash2 } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { barShapeFor } from "@/components/workout/equipment/art";
import { ModalityBadge } from "@/components/exercises/ModalityBadge";
import type { WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import type { WeightUnit } from "@/contracts/enums";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Term } from "@/components/ui/Term";
import { isGearEquipment } from "@/client/repo/gear";
import type { TermId } from "@/lib/glossary";
import { ActiveSetPanel, type ActiveSetPanelProps } from "./ActiveSetPanel";
import { dialSetup, isBarProfileExercise } from "./dial-setup";
import { EquipmentPicture } from "./EquipmentPicture";
import { PANEL_COPY, setFields } from "./labels";
import { useDialLayout } from "./layout";
import { useScrollIntoViewOnFocus } from "./scrollToExercise";
import type { WorkoutPrefs } from "./prefs";
import { SetRow, type SetRowGhost, type SetRowProps } from "./SetRow";
import { ghostSet, shownWeight, unitForSet, weightStep } from "./session";
import type { ExerciseView } from "./view";

export interface ExerciseBlockActions {
  onSetChange: (set: WorkoutSetRow, patch: WorkoutSetPatch) => void;
  onToggleSet: (set: WorkoutSetRow, ghost: SetRowGhost | null) => void;
  onDeleteSet: (set: WorkoutSetRow) => void;
  onAddSet: () => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
  /** Link with the exercise below, or leave the superset. */
  onSuperset: (mode: "link-next" | "unlink") => void;
  onChangeMachine?: () => void;
  /** Open the "Bar and plates" sheet for this exercise (barbells, EZ bars, trap bars). */
  onEditBar?: () => void;
  /** Open the gear sheet for this exercise (dumbbell step or the kettlebells owned). */
  onEditGear?: () => void;
}

export interface ExerciseBlockProps {
  item: ExerciseView;
  prefs: WorkoutPrefs;
  prs: Map<string, PrCandidate[]>;
  actions: ExerciseBlockActions;
  /** "A", "B", ... when this exercise is part of a superset. */
  supersetLabel?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canLinkNext: boolean;
  /** Hide ghost values (history edits). */
  showGhost?: boolean;
  /**
   * Live logging: on phones and tablets the active set is the dial panel and the other sets are compact rows; on a desktop with a
   * fine pointer the rows stay inline (typing) with a 96 px picture beside the active one. History edits leave this off.
   */
  panel?: boolean;
  /** Phones: this is the exercise that shows the panel; the others show compact rows only. Default true. */
  focused?: boolean;
  /** Phones: a compact row of this exercise was tapped (or its set was just logged). Receives the workout exercise id, so one stable callback serves every block. */
  onFocus?: (exerciseId: string) => void;
  /** Phones: "Logged ✓" is over and the next set is about to become active. `allDone`: no set of this exercise is left to do. */
  onAdvance?: (exerciseId: string, allDone: boolean) => void;
  /** The workout's bodyweight in kg, for the "Added to 82.5 kg bodyweight" caption. */
  bodyweightKg?: number | null;
}

const LOAD_TERM: Partial<Record<ExerciseView["exercise"]["loadType"], TermId>> = {
  TOTAL: "loadTotal",
  PER_IMPLEMENT: "loadPerHand",
  PLATES_PER_SIDE: "loadPerSide",
  STACK: "loadStack",
  BODYWEIGHT_PLUS: "bodyweightPlus",
};

/** A one-line key above the sets: what the weight number means here, what effort and set type are, and the grey "last" values. */
function SetLegend({ exercise, last, effortScale, showGhost }: Pick<ExerciseView, "exercise" | "last"> & { effortScale: WorkoutPrefs["effortScale"]; showGhost: boolean }) {
  const loadTerm = LOAD_TERM[exercise.loadType];
  const hasGhost = showGhost && last !== undefined;
  return (
    <p className="wk-legend" aria-label="What the set fields mean">
      {loadTerm ? (
        <span className="wk-legend__item">
          Weight
          <InfoHint term={loadTerm} />
          {/assisted/i.test(exercise.name) ? <InfoHint term="assisted" /> : null}
        </span>
      ) : null}
      <span className="wk-legend__item">
        Effort ({effortScale})
        <InfoHint term={effortScale === "RPE" ? "rpe" : "rir"} />
      </span>
      <span className="wk-legend__item">
        Set type
        <InfoHint term="setType" />
      </span>
      {hasGhost ? (
        <span className="wk-legend__item">
          Last time
          <InfoHint term="lastTime" />
        </span>
      ) : null}
    </p>
  );
}

/** The 96 px picture beside the active row on desktop: what the typed weight means on the equipment, no caption. */
function previewPicture({ item, set, unit, step, ghost }: { item: ExerciseView; set: WorkoutSetRow; unit: WeightUnit; step: number; ghost: SetRowGhost | null }) {
  const { exercise } = item;
  const facts = item.machine ?? item.barProfile ?? null;
  const value = shownWeight(set.weightKg, unit) ?? (ghost?.weightKg != null ? shownWeight(ghost.weightKg, unit) : null);
  const setup = dialSetup({ exercise, unit, step, current: value, machine: facts, gear: item.gear ?? null });
  if (!setup.kind) return null;
  return <EquipmentPicture kind={setup.kind} shape={barShapeFor(exercise.equipment)} loadType={exercise.loadType} isUnilateral={exercise.isUnilateral} setup={setup} value={value} hasProfile={facts !== null} size="preview" />;
}

type BoundRowProps = Omit<SetRowProps, "onChange" | "onToggleComplete" | "onDelete" | "onActivate"> & {
  actions: ExerciseBlockActions;
  /** Compact rows: make this set the active one. One callback for the block; the row passes its own id. */
  activate?: (setId: string) => void;
};

/**
 * A set row with its three callbacks bound to this set. The bindings are memoized on (actions, set, ghost), all of which keep their
 * identity while the set is unchanged, so `memo` really does skip the row when a sibling set is written.
 */
const BoundSetRow = memo(function BoundSetRow({ actions, activate, ...row }: BoundRowProps) {
  const { set, ghost } = row;
  const onChange = useCallback((patch: WorkoutSetPatch) => actions.onSetChange(set, patch), [actions, set]);
  const onToggleComplete = useCallback(() => actions.onToggleSet(set, ghost ?? null), [actions, set, ghost]);
  const onDelete = useCallback(() => actions.onDeleteSet(set), [actions, set]);
  const onActivate = useMemo(() => (activate ? () => activate(set.id) : undefined), [activate, set.id]);
  return <SetRow {...row} onChange={onChange} onToggleComplete={onToggleComplete} onDelete={onDelete} onActivate={onActivate} />;
});

type BoundPanelProps = Omit<ActiveSetPanelProps, "onChange" | "onToggleComplete" | "onDelete" | "onAdvance"> & {
  actions: ExerciseBlockActions;
  /** The lifter tapped Log set on this set. */
  logging: (setId: string) => void;
  advance: () => void;
};

const BoundActivePanel = memo(function BoundActivePanel({ actions, logging, advance, ...panel }: BoundPanelProps) {
  const { set, ghost } = panel;
  const onChange = useCallback((patch: WorkoutSetPatch) => actions.onSetChange(set, patch), [actions, set]);
  const onDelete = useCallback(() => actions.onDeleteSet(set), [actions, set]);
  const onToggleComplete = useCallback(() => {
    if (set.completedAt == null) logging(set.id);
    actions.onToggleSet(set, ghost ?? null);
  }, [actions, logging, set, ghost]);
  return <ActiveSetPanel {...panel} onChange={onChange} onToggleComplete={onToggleComplete} onDelete={onDelete} onAdvance={advance} />;
});

/** An exercise created this recently is "just added": it is scrolled into view when it first shows. */
const JUST_ADDED_MS = 5000;

/**
 * One exercise of a workout: header (name, modality, machine), its sets, add set, and a small menu (reorder, superset, remove).
 * Memoized: its props (`item`, `prs`, `actions`, the callbacks) keep their identity while this exercise is unchanged.
 */
export const ExerciseBlock = memo(function ExerciseBlock({ item, prefs, prs, actions, supersetLabel, canMoveUp, canMoveDown, canLinkNext, showGhost = true, panel = false, focused = true, onFocus, onAdvance, bodyweightKg }: ExerciseBlockProps) {
  const { exercise, machine, barProfile, sets, last } = item;
  const gear = item.gear ?? null;
  const firstOpen = sets.find((s) => s.completedAt == null);
  const workingNumber = sets.map((_, i) => sets.slice(0, i + 1).filter((x) => x.setType !== "WARMUP").length);
  const dialLayout = useDialLayout();
  const plan = setFields(exercise);
  const phone = panel && dialLayout && (plan.weight || plan.reps);
  // The set the panel shows: the one the lifter tapped, else the one just logged (while "Logged ✓" shows), else the first not done.
  const [picked, setPicked] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const activeSet = phone && focused ? (sets.find((s) => s.id === picked) ?? sets.find((s) => s.id === held) ?? firstOpen ?? null) : null;
  const facts = machine ?? barProfile ?? null;
  const editBar = actions.onEditBar && !machine && isBarProfileExercise(exercise) ? actions.onEditBar : undefined;
  const editGear = actions.onEditGear && !machine && isGearEquipment(exercise.equipment) ? actions.onEditGear : undefined;
  const effortScale = prefs.effortScale;
  const legend = useMemo(() => <SetLegend exercise={exercise} last={last} effortScale={effortScale} showGhost={showGhost} />, [exercise, last, effortScale, showGhost]);
  const exerciseId = item.we.id;
  const activateSet = useCallback(
    (setId: string) => {
      setHeld(null);
      setPicked(setId);
      onFocus?.(exerciseId);
    },
    [onFocus, exerciseId],
  );
  const loggingSet = useCallback(
    (setId: string) => {
      setHeld(setId);
      onFocus?.(exerciseId); // stay on this exercise while "Logged ✓" shows
    },
    [onFocus, exerciseId],
  );
  const advanceFromPanel = useCallback(() => {
    setHeld(null);
    setPicked(null);
    onAdvance?.(exerciseId, !sets.some((s) => s.completedAt == null));
  }, [onAdvance, exerciseId, sets]);
  const sectionRef = useRef<HTMLElement>(null);
  // An exercise added a moment ago (the picker, or a template just started) is brought into view; one that was already in a resumed workout is not.
  const [justAdded] = useState(() => Date.now() - Date.parse(item.we.createdAt) < JUST_ADDED_MS);
  useScrollIntoViewOnFocus(sectionRef, focused, Boolean(phone), justAdded);
  return (
    <section ref={sectionRef} className={clsx("wk-exercise", supersetLabel && "wk-exercise--superset")} aria-label={exercise.name} data-exercise-id={exercise.id}>
      {supersetLabel ? (
        <p className="wk-exercise__superset">
          <Term id="superset">Superset {supersetLabel}</Term>
        </p>
      ) : null}
      <header className="wk-exercise__head">
        <div className="wk-exercise__title">
          <h2 className={clsx("wk-exercise__name", activeSet && "sr-only")}>{exercise.name}</h2>
          <ModalityBadge modality={exercise.modality} equipment={exercise.equipment} />
          {machine ? (
            <p className="wk-exercise__machine">
              <strong>{machine.name}</strong>
              {machine.gymName ? <span> · {machine.gymName}</span> : null}
              <InfoHint term="machineProfile" />
            </p>
          ) : null}
          {editBar && !activeSet ? (
            <p className="wk-exercise__machine">
              <button type="button" className="wk-exercise__bar" onClick={editBar}>
                {PANEL_COPY.barAndPlates}
              </button>
              <InfoHint term="barProfile" />
            </p>
          ) : null}
        </div>
        <details className="wk-menu">
          <summary className="wk-icon-btn" aria-label={`${exercise.name} options`}>
            <MoreHorizontal size={20} aria-hidden="true" />
          </summary>
          <div className="wk-menu__panel">
            <button type="button" disabled={!canMoveUp} onClick={() => actions.onMove("up")}>
              <ArrowUp size={16} aria-hidden="true" /> Move up
            </button>
            <button type="button" disabled={!canMoveDown} onClick={() => actions.onMove("down")}>
              <ArrowDown size={16} aria-hidden="true" /> Move down
            </button>
            {canLinkNext ? (
              <button type="button" onClick={() => actions.onSuperset("link-next")}>
                <Link2 size={16} aria-hidden="true" /> Superset with next
              </button>
            ) : null}
            {supersetLabel ? (
              <button type="button" onClick={() => actions.onSuperset("unlink")}>
                <Link2Off size={16} aria-hidden="true" /> Leave superset
              </button>
            ) : null}
            {actions.onChangeMachine && machine ? (
              <button type="button" onClick={actions.onChangeMachine}>
                <Repeat size={16} aria-hidden="true" /> Change machine
              </button>
            ) : null}
            <button type="button" className="wk-menu__danger" onClick={actions.onRemove}>
              <Trash2 size={16} aria-hidden="true" /> Remove exercise
            </button>
          </div>
        </details>
      </header>

      {phone && (activeSet || !focused) ? null : legend}
      <ol className="wk-sets">
        {sets.map((set, index) => {
          const ghost = showGhost ? ghostSet(last, sets, set) : null;
          const unit = unitForSet(set, machine ?? gear, prefs.unit);
          const step = weightStep(unit, exercise, machine, gear);
          const rowProps = {
            actions,
            label: set.setType === "WARMUP" ? "W" : String(workingNumber[index]),
            ordinal: index + 1,
            set,
            exercise,
            unit,
            step,
            effortScale,
            ghost,
            isPr: prs.has(set.id),
          };
          if (phone && activeSet?.id === set.id) {
            return (
              <BoundActivePanel
                key={set.id}
                {...rowProps}
                exerciseName={exercise.name}
                setCount={sets.length}
                machine={facts}
                bodyweightKg={bodyweightKg}
                legend={legend}
                onEditBar={editBar}
                gear={gear}
                onEditGear={editGear}
                logging={loggingSet}
                advance={advanceFromPanel}
              />
            );
          }
          if (phone) return <BoundSetRow key={set.id} {...rowProps} variant="compact" activate={activateSet} />;
          const active = firstOpen?.id === set.id;
          const preview: ReactNode = panel && active && plan.weight ? previewPicture({ item, set, unit, step, ghost }) : null;
          return <BoundSetRow key={set.id} {...rowProps} active={active} preview={preview} />;
        })}
      </ol>
      <Button variant="ghost" block icon={<Plus size={18} />} onClick={actions.onAddSet} aria-label={`Add set to ${exercise.name}`}>
        Add set
      </Button>
    </section>
  );
});
