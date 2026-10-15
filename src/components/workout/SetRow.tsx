"use client";
import clsx from "clsx";
import { Check, Star, Trash2 } from "lucide-react";
import { NumberStepper } from "@/components/ui/NumberStepper";
import type { ExerciseRow, WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { EffortScale, SetType, WeightUnit } from "@/contracts/enums";
import { formatWeight } from "@/lib/units";
import { effortOptions, loadLabel, setFields, SET_TYPE_LABEL, unitLabel } from "./labels";
import { shownWeight, weightPatch } from "./session";

export type SetRowExercise = Pick<ExerciseRow, "loadType" | "tracking" | "equipment" | "isUnilateral">;

export interface SetRowGhost {
  weightKg: number | null;
  reps: number | null;
  inputUnit: WeightUnit | null;
  durationSec: number | null;
  distanceM: number | null;
}

export interface SetRowProps {
  /** Label shown in the badge: the set number among its kind ("1", "2"), or "W" for a warm-up. */
  label: string;
  /** Position among all sets of the exercise, for accessible names ("Set 3 weight"). */
  ordinal: number;
  set: WorkoutSetRow;
  exercise: SetRowExercise;
  /** Unit this row is entered in (kg or lb). */
  unit: WeightUnit;
  /** Weight stepper increment, in `unit`. */
  step: number;
  effortScale: EffortScale;
  /** The matching set of the previous session, shown as ghost text. */
  ghost?: SetRowGhost | null;
  /** This set broke a personal record. */
  isPr?: boolean;
  /** The next set to do (highlighted). */
  active?: boolean;
  onChange: (patch: WorkoutSetPatch) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
}

const SET_TYPES: SetType[] = ["WORKING", "WARMUP", "DROP", "AMRAP"];

function ghostText(ghost: SetRowGhost, fields: ReturnType<typeof setFields>, unit: WeightUnit): string | null {
  const parts: string[] = [];
  if (fields.weight && ghost.weightKg != null) parts.push(formatWeight(ghost.weightKg, ghost.inputUnit ?? unit, { withUnit: false }));
  if (fields.reps && ghost.reps != null) parts.push(`${ghost.reps}`);
  if (fields.distance && ghost.distanceM != null) parts.push(`${ghost.distanceM} m`);
  if (fields.duration && ghost.durationSec != null) parts.push(`${ghost.durationSec} s`);
  if (parts.length === 0) return null;
  return fields.weight && fields.reps ? parts.join(" × ") : parts.join(" · ");
}

/**
 * One set. Labelled by LoadType ("per hand", "per side", "stack", "+ bodyweight", "total") and TrackingType; states:
 * planned, active (next up), completed, PR, warm-up (muted). Props only: the parent writes through `repo`.
 */
export function SetRow({ label, ordinal, set, exercise, unit, step, effortScale, ghost, isPr = false, active = false, onChange, onToggleComplete, onDelete }: SetRowProps) {
  const fields = setFields(exercise);
  const load = loadLabel(exercise);
  const completed = set.completedAt != null;
  const warmup = set.setType === "WARMUP";
  const ghostLine = ghost ? ghostText(ghost, fields, unit) : null;
  const name = `Set ${ordinal}`;
  const weightCaption = [unitLabel(unit), load.short].filter(Boolean).join(" · ");

  return (
    <li
      className={clsx("wk-set", completed && "wk-set--completed", warmup && "wk-set--warmup", isPr && "wk-set--pr", active && !completed && "wk-set--active")}
      data-set-id={set.id}
      data-state={completed ? "completed" : active ? "active" : "planned"}
    >
      <div className="wk-set__head">
        <span className="wk-set__badge num" aria-hidden="true">
          {label}
        </span>
        {isPr ? (
          <span className="wk-set__pr">
            <Star size={14} aria-hidden="true" fill="currentColor" strokeWidth={0} /> PR
          </span>
        ) : null}
        {ghostLine ? (
          <span className="wk-set__ghost num" aria-label={`Last time ${ghostLine}`}>
            last {ghostLine}
          </span>
        ) : null}
        <select
          className="wk-set__type"
          aria-label={`${name} type`}
          value={set.setType}
          onChange={(e) => onChange({ setType: e.target.value as SetType })}
        >
          {SET_TYPES.map((t) => (
            <option key={t} value={t}>
              {SET_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="wk-set__done"
          aria-pressed={completed}
          aria-label={completed ? `Mark ${name.toLowerCase()} not done` : `Complete ${name.toLowerCase()}`}
          onClick={onToggleComplete}
        >
          <Check size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="wk-set__inputs">
        {fields.weight ? (
          <div className="wk-set__field">
            <span className="wk-set__caption" aria-hidden="true">
              {weightCaption}
            </span>
            <NumberStepper
              label={`${name} weight, ${weightCaption}`}
              hideLabel
              kind="weight"
              step={step}
              value={shownWeight(set.weightKg, unit)}
              onChange={(v) => onChange(weightPatch(v, unit))}
            />
          </div>
        ) : null}
        {fields.distance ? (
          <div className="wk-set__field">
            <span className="wk-set__caption" aria-hidden="true">
              metres
            </span>
            <NumberStepper label={`${name} distance in metres`} hideLabel kind="weight" step={50} value={set.distanceM} onChange={(v) => onChange({ distanceM: v })} />
          </div>
        ) : null}
        {fields.reps ? (
          <div className="wk-set__field">
            <span className="wk-set__caption" aria-hidden="true">
              reps
            </span>
            <NumberStepper label={`${name} reps`} hideLabel kind="reps" step={1} max={1000} value={set.reps} onChange={(v) => onChange({ reps: v })} />
          </div>
        ) : null}
        {fields.duration ? (
          <div className="wk-set__field">
            <span className="wk-set__caption" aria-hidden="true">
              seconds
            </span>
            <NumberStepper label={`${name} time in seconds`} hideLabel kind="reps" step={5} max={86400} value={set.durationSec} onChange={(v) => onChange({ durationSec: v })} />
          </div>
        ) : null}
      </div>

      <div className="wk-set__foot">
        {!warmup && (fields.reps || fields.weight) ? (
          <div className="wk-effort" role="group" aria-label={`${name} ${effortScale}`}>
            <span className="wk-effort__label" aria-hidden="true">
              {effortScale}
            </span>
            {effortOptions(effortScale).map((o) => (
              <button
                key={o.rir}
                type="button"
                className="wk-effort__btn num"
                aria-pressed={set.rir === o.rir}
                aria-label={`${name} ${effortScale} ${o.label}`}
                onClick={() => onChange({ rir: set.rir === o.rir ? null : o.rir })}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" className="wk-icon-btn" aria-label={`Delete ${name.toLowerCase()}`} onClick={onDelete}>
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
