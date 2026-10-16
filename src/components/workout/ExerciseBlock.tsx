"use client";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Link2, Link2Off, MoreHorizontal, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { ModalityBadge } from "@/components/exercises/ModalityBadge";
import type { WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import type { WeightUnit } from "@/contracts/enums";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Term } from "@/components/ui/Term";
import { isGearEquipment } from "@/lib/gear";
import type { TermId } from "@/lib/glossary";
import { ActiveSetPanel } from "./ActiveSetPanel";
import { dialSetup, isBarProfileExercise } from "./dial-setup";
import { EquipmentPicture } from "./EquipmentPicture";
import { PANEL_COPY, setFields } from "./labels";
import { useDialLayout } from "./layout";
import type { WorkoutPrefs } from "./prefs";
import { SetRow, type SetRowGhost } from "./SetRow";
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
  /** Phones: a compact row of this exercise was tapped. */
  onFocus?: () => void;
  /** Phones: "Logged ✓" is over and the next set is about to become active. */
  onAdvance?: () => void;
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
function SetLegend({ item, prefs, showGhost }: { item: ExerciseView; prefs: WorkoutPrefs; showGhost: boolean }) {
  const { exercise, last } = item;
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
        Effort ({prefs.effortScale})
        <InfoHint term={prefs.effortScale === "RPE" ? "rpe" : "rir"} />
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
  return <EquipmentPicture kind={setup.kind} loadType={exercise.loadType} isUnilateral={exercise.isUnilateral} setup={setup} value={value} hasProfile={facts !== null} size="preview" />;
}

/** One exercise of a workout: header (name, modality, machine), its sets, add set, and a small menu (reorder, superset, remove). */
export function ExerciseBlock({ item, prefs, prs, actions, supersetLabel, canMoveUp, canMoveDown, canLinkNext, showGhost = true, panel = false, focused = true, onFocus, onAdvance, bodyweightKg }: ExerciseBlockProps) {
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
  const legend = <SetLegend item={item} prefs={prefs} showGhost={showGhost} />;
  return (
    <section className={clsx("wk-exercise", supersetLabel && "wk-exercise--superset")} aria-label={exercise.name} data-exercise-id={exercise.id}>
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
            label: set.setType === "WARMUP" ? "W" : String(workingNumber[index]),
            ordinal: index + 1,
            set,
            exercise,
            unit,
            step,
            effortScale: prefs.effortScale,
            ghost,
            isPr: prs.has(set.id),
            onChange: (patch: WorkoutSetPatch) => actions.onSetChange(set, patch),
            onToggleComplete: () => actions.onToggleSet(set, ghost),
            onDelete: () => actions.onDeleteSet(set),
          };
          if (phone && activeSet?.id === set.id) {
            return (
              <ActiveSetPanel
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
                onToggleComplete={() => {
                  if (set.completedAt == null) {
                    setHeld(set.id);
                    onFocus?.(); // stay on this exercise while "Logged ✓" shows
                  }
                  actions.onToggleSet(set, ghost);
                }}
                onAdvance={() => {
                  setHeld(null);
                  setPicked(null);
                  onAdvance?.();
                }}
              />
            );
          }
          if (phone) {
            return (
              <SetRow
                key={set.id}
                {...rowProps}
                variant="compact"
                onActivate={() => {
                  setHeld(null);
                  setPicked(set.id);
                  onFocus?.();
                }}
              />
            );
          }
          const active = firstOpen?.id === set.id;
          const preview = panel && active && plan.weight ? previewPicture({ item, set, unit, step, ghost }) : null;
          return <SetRow key={set.id} {...rowProps} active={active} preview={preview} />;
        })}
      </ol>
      <Button variant="ink" block icon={<Plus size={18} />} onClick={actions.onAddSet} aria-label={`Add set to ${exercise.name}`}>
        Add set
      </Button>
    </section>
  );
}
