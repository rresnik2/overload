"use client";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Link2, Link2Off, MoreHorizontal, Plus, Repeat, Trash2 } from "lucide-react";
import { ModalityBadge } from "@/components/exercises/ModalityBadge";
import type { WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { PrCandidate } from "@/contracts/prs";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Term } from "@/components/ui/Term";
import type { TermId } from "@/lib/glossary";
import type { WorkoutPrefs } from "./prefs";
import { SetRow, type SetRowGhost } from "./SetRow";
import { ghostSet, unitForSet, weightStep } from "./session";
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

/** One exercise of a workout: header (name, modality, machine), its sets, add set, and a small menu (reorder, superset, remove). */
export function ExerciseBlock({ item, prefs, prs, actions, supersetLabel, canMoveUp, canMoveDown, canLinkNext, showGhost = true }: ExerciseBlockProps) {
  const { exercise, machine, sets, last } = item;
  const firstOpen = sets.find((s) => s.completedAt == null);
  const workingNumber = sets.map((_, i) => sets.slice(0, i + 1).filter((x) => x.setType !== "WARMUP").length);
  return (
    <section className={clsx("wk-exercise", supersetLabel && "wk-exercise--superset")} aria-label={exercise.name} data-exercise-id={exercise.id}>
      {supersetLabel ? (
        <p className="wk-exercise__superset">
          <Term id="superset">Superset {supersetLabel}</Term>
        </p>
      ) : null}
      <header className="wk-exercise__head">
        <div className="wk-exercise__title">
          <h2 className="wk-exercise__name">{exercise.name}</h2>
          <ModalityBadge modality={exercise.modality} equipment={exercise.equipment} />
          {machine ? (
            <p className="wk-exercise__machine">
              <strong>{machine.name}</strong>
              {machine.gymName ? <span> · {machine.gymName}</span> : null}
              <InfoHint term="machineProfile" />
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

      <SetLegend item={item} prefs={prefs} showGhost={showGhost} />
      <ol className="wk-sets">
        {sets.map((set, index) => {
          const ghost = showGhost ? ghostSet(last, sets, set) : null;
          const unit = unitForSet(set, machine, prefs.unit);
          return (
            <SetRow
              key={set.id}
              label={set.setType === "WARMUP" ? "W" : String(workingNumber[index])}
              ordinal={index + 1}
              set={set}
              exercise={exercise}
              unit={unit}
              step={weightStep(unit, exercise, machine)}
              effortScale={prefs.effortScale}
              ghost={ghost}
              isPr={prs.has(set.id)}
              active={firstOpen?.id === set.id}
              onChange={(patch) => actions.onSetChange(set, patch)}
              onToggleComplete={() => actions.onToggleSet(set, ghost)}
              onDelete={() => actions.onDeleteSet(set)}
            />
          );
        })}
      </ol>
      <Button variant="ink" block icon={<Plus size={18} />} onClick={actions.onAddSet} aria-label={`Add set to ${exercise.name}`}>
        Add set
      </Button>
    </section>
  );
}
