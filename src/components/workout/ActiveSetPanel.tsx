"use client";
import clsx from "clsx";
import { Star, Trash2 } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { EQUIPMENT_LABEL } from "@/components/exercises/labels";
import { ECHO_MS, type CommitHandle } from "@/components/ui/commit";
import { Dial } from "@/components/ui/Dial";
import { NumberStrip } from "@/components/ui/NumberStrip";
import { Term } from "@/components/ui/Term";
import type { MachineProfileRow } from "@/contracts/entities";
import type { SetType } from "@/contracts/enums";
import { formatNumber, fromKg } from "@/lib/units";
import { dialColors, dialSetup, pinOf, type DialGear } from "./dial-setup";
import { EquipmentPicture } from "./EquipmentPicture";
import { effortOptions, PANEL_COPY, readoutUnit, effortText, SET_TYPE_LABEL, setFields, weightSpoken } from "./labels";
import { heaviestTone, loadBar } from "./plates";
import { shownWeight, weightPatch } from "./session";
import type { SetRowProps } from "./SetRow";
import { WeightReadout } from "./WeightReadout";

export interface ActiveSetPanelProps
  extends Pick<SetRowProps, "label" | "ordinal" | "set" | "exercise" | "unit" | "step" | "effortScale" | "ghost" | "isPr" | "onChange" | "onToggleComplete"> {
  exerciseName: string;
  /** How many sets the exercise has ("set 3 of 4"). */
  setCount: number;
  /** The machine profile in use, or the exercise's bar profile. `platesKg` is missing on rows written before the field existed. */
  machine: (Pick<MachineProfileRow, "pinStepKg" | "baseLoadKg" | "labelUnit"> & { platesKg?: readonly number[] | null }) | null;
  onDelete?: () => void;
  /** The set-field key (SetLegend) shown between the meta line and the picture. */
  legend?: ReactNode;
  /** Bodyweight of the workout in kg, for the "Added to 82.5 kg bodyweight" caption. */
  bodyweightKg?: number | null;
  /** Opens the bar and plates sheet (barbells only). */
  onEditBar?: () => void;
  /** The user's gear profile (dumbbell step or kettlebells owned) for dumbbell and kettlebell exercises; null = the defaults. */
  gear?: DialGear | null;
  /** Opens the gear sheet (dumbbells and kettlebells): their step or the bells they own. */
  onEditGear?: () => void;
  /** The "Logged ✓" flash is over: the parent makes the next incomplete set active. */
  onAdvance?: () => void;
}

/** How long "Logged ✓" shows before the next set becomes active. */
export const LOGGED_FLASH_MS = 1300;
const NOTE_MS = 3000;
const SET_TYPES: SetType[] = ["WORKING", "WARMUP", "DROP", "AMRAP"];

/** 1..30 (more when the set already has more), plus 0 when that is what was logged. */
function repValues(current: number | null): number[] {
  const top = Math.max(30, current ?? 0);
  const out = Array.from({ length: top }, (_, i) => i + 1);
  return current === 0 ? [0, ...out] : out;
}

/**
 * A number the lifter is turning: `shown` follows the control live (`live`), the stored `committed` value catches up after the
 * control commits (`settled` starts a short timer that drops the draft if the stored value never changes, e.g. a failed write).
 * The draft is also dropped as soon as the stored value changes, so the stored value always wins once it arrives.
 */
function useLiveValue(committed: number | null) {
  const [draft, setDraft] = useState<number | null>(null);
  const [seen, setSeen] = useState(committed);
  if (seen !== committed) {
    setSeen(committed);
    setDraft(null);
  }
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const live = useCallback((v: number) => {
    window.clearTimeout(timer.current);
    setDraft(v);
  }, []);
  const settled = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDraft(null), ECHO_MS);
  }, []);
  return [draft ?? committed, live, settled] as const;
}

/**
 * The set you are about to do, one at a time, on a phone (spec section 04): name and meta, the set legend, the equipment picture
 * with its caption, the big weight, the plate-face dial, the reps strip, the effort buttons and a sticky Log set. Every write goes
 * through `onChange` with the same patches as SetRow, and weights through weightPatch(), so storage stays in kg.
 * Values the lifter has not entered yet are shown from last time (`ghost`), and Log set fills them in exactly like the check does.
 */
export const ActiveSetPanel = memo(function ActiveSetPanel({
  label,
  ordinal,
  set,
  exercise,
  exerciseName,
  setCount,
  unit,
  step,
  effortScale,
  ghost,
  isPr = false,
  machine,
  bodyweightKg,
  legend,
  onChange,
  onToggleComplete,
  onDelete,
  onEditBar,
  gear = null,
  onEditGear,
  onAdvance,
}: ActiveSetPanelProps) {
  const fields = setFields(exercise);
  const completed = set.completedAt != null;
  const warmup = set.setType === "WARMUP";
  const name = `Set ${ordinal}`;

  const entered = shownWeight(set.weightKg, unit);
  const fromLast = ghost?.weightKg != null ? fromKg(ghost.weightKg, unit) : null;
  // The stored values (what the controls rest on) and the live ones (what the readout, the picture and the Log label show mid-turn).
  const storedWeight = fields.weight ? (entered ?? fromLast) : null;
  const storedReps = fields.reps ? (set.reps ?? ghost?.reps ?? null) : null;
  const [weight, liveWeight, weightSettled] = useLiveValue(storedWeight);
  const [reps, liveReps, repsSettled] = useLiveValue(storedReps);
  // The dial's values come from the STORED weight, so they do not change under the finger while it turns.
  const setup = useMemo(() => dialSetup({ exercise, unit, step, current: storedWeight, machine, gear }), [exercise, unit, step, storedWeight, machine, gear]);

  const loadout = setup.kind === "bar" ? loadBar(weight ?? setup.bar ?? 0, setup.bar ?? 0, setup.plates) : null;
  const colors = dialColors(setup.kind, loadout ? heaviestTone(loadout.perSide) : null);

  const weightDial = useRef<CommitHandle>(null);
  const repsStrip = useRef<CommitHandle>(null);
  const commitWeight = useCallback(
    (v: number) => {
      weightSettled();
      onChange(weightPatch(v, unit));
    },
    [onChange, unit, weightSettled],
  );
  const commitReps = useCallback(
    (v: number) => {
      repsSettled();
      onChange({ reps: v });
    },
    [onChange, repsSettled],
  );
  const spokenWeight = useCallback((v: number) => weightSpoken(v, unit, exercise.loadType, setup.kind === "stack" ? pinOf(v, setup) : null), [unit, exercise.loadType, setup]);
  const repOptions = useMemo(() => repValues(storedReps), [storedReps]);
  const repsSpoken = useCallback((v: number) => `${v} reps`, []);

  // Log set -> "Logged ✓" for 1300 ms -> the parent advances. The flash starts when the set actually completes, so a failed write shows nothing.
  const [armed, setArmed] = useState(false);
  const flashing = armed && completed;
  const advance = useRef(onAdvance);
  useEffect(() => {
    advance.current = onAdvance;
  });
  useEffect(() => {
    if (!flashing) return;
    const timer = window.setTimeout(() => {
      setArmed(false);
      advance.current?.();
    }, LOGGED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashing]);

  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    },
    [],
  );
  const showNote = (text: string) => {
    setNote(text);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), NOTE_MS);
  };

  const lastLine = ghost && (ghost.weightKg != null || ghost.reps != null)
    ? `last ${[fields.weight && ghost.weightKg != null ? formatNumber(fromKg(ghost.weightKg, ghost.inputUnit ?? unit)) : null, fields.reps && ghost.reps != null ? String(ghost.reps) : null].filter(Boolean).join(" × ")}${effortText(effortScale, ghost.rir) ? ` @ ${effortText(effortScale, ghost.rir)}` : ""}`
    : null;
  const unitShort = unit === "KG" ? "kg" : "lb";
  const meta = PANEL_COPY.meta([
    EQUIPMENT_LABEL[exercise.equipment],
    setup.kind === "bar" && setup.bar !== null && `${formatNumber(setup.bar)} ${unitShort} bar`,
    setup.kind === "stack" && `${formatNumber(setup.step)} ${unitShort} pin step`,
    `set ${ordinal} of ${setCount}`,
    lastLine,
  ]);
  const caption = exercise.loadType === "BODYWEIGHT_PLUS" && bodyweightKg != null ? PANEL_COPY.addedToBodyweight(fromKg(bodyweightKg, unit), unit) : null;

  const logWeight = weight !== null ? `${formatNumber(weight)} ${unitShort}` : null;
  const logDetail = [logWeight, reps !== null ? (logWeight ? `× ${reps}` : `${reps} reps`) : null].filter(Boolean).join(" ");
  const logLabel = logDetail ? `${PANEL_COPY.logSet} · ${logDetail}` : PANEL_COPY.logSet;
  const missing = weight === null && reps === null;
  const hintId = `${set.id}-need`;

  const onLog = () => {
    if (completed) {
      onToggleComplete(); // reopen
      return;
    }
    // A value still waiting for its commit (a key press a moment ago) is written first; the completion reads the stored set after it.
    weightDial.current?.flush();
    repsStrip.current?.flush();
    setArmed(true);
    onToggleComplete();
  };

  const state = completed ? "completed" : "active";
  return (
    <li className={clsx("wk-set wk-panel", completed && "wk-set--completed wk-panel--done", warmup && "wk-set--warmup", isPr && "wk-set--pr", flashing && "is-logged")} data-set-id={set.id} data-state={state} data-panel="true">
      <div className="wk-panel__head">
        <p className={clsx("wk-panel__name type-display-m", exerciseName.length > 22 && "wk-panel__name--long")} aria-hidden="true">
          {exerciseName}
        </p>
        <div className="wk-panel__metarow">
          <p className="wk-panel__meta">
            <span className="wk-set__badge num" aria-hidden="true">
              {label}
            </span>
            {isPr ? (
              <span className="wk-set__pr">
                <Star size={14} aria-hidden="true" fill="currentColor" strokeWidth={0} /> <Term id="personalRecord">PR</Term>
              </span>
            ) : null}
            {meta}
          </p>
          <select className="wk-set__type" aria-label={`${name} type`} value={set.setType} onChange={(e) => onChange({ setType: e.target.value as SetType })}>
            {SET_TYPES.map((t) => (
              <option key={t} value={t}>
                {SET_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {onDelete ? (
            <button type="button" className="wk-icon-btn" aria-label={`Delete ${name.toLowerCase()}`} onClick={onDelete}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {legend}

      {fields.weight && setup.kind ? (
        <EquipmentPicture
          kind={setup.kind}
          loadType={exercise.loadType}
          isUnilateral={exercise.isUnilateral}
          setup={setup}
          value={weight}
          hasProfile={machine !== null}
          note={note}
          captionExtra={
            setup.kind === "bar" && onEditBar ? (
              <button type="button" className="wk-panel__link" onClick={onEditBar}>
                {PANEL_COPY.barAndPlates}
              </button>
            ) : (setup.kind === "dumbbell" || setup.kind === "kettlebell") && onEditGear ? (
              <button type="button" className="wk-panel__link" onClick={onEditGear}>
                {setup.kind === "dumbbell" ? PANEL_COPY.gearDumbbells(setup.step, unit) : PANEL_COPY.gearKettlebells(gear?.platesKg?.length || null)}
              </button>
            ) : null
          }
        />
      ) : caption ? (
        <p className="eq__caption wk-panel__caption">{caption}</p>
      ) : null}

      <div className="wk-panel__read">
        {fields.weight ? <WeightReadout ordinal={ordinal} unit={unit} unitText={readoutUnit(unit, exercise.loadType)} value={weight} ghost={entered === null && weight === storedWeight} disabled={completed} onCommit={(v) => onChange(weightPatch(v, unit))} onLimited={(max) => showNote(PANEL_COPY.limited(max, unit))} /> : null}
        {fields.weight && fields.reps ? (
          <span className="wk-panel__x type-display-s" aria-hidden="true">
            ×
          </span>
        ) : null}
        {fields.reps ? (
          <span className={clsx("wk-panel__reps type-readout num", !fields.weight && "wk-panel__reps--solo")} aria-hidden="true">
            {reps ?? "—"}
            {!fields.weight ? <span className="wk-readout__unit type-label">REPS</span> : null}
          </span>
        ) : null}
      </div>

      {fields.weight ? (
        <Dial
          ref={weightDial}
          label={PANEL_COPY.weightFor(ordinal)}
          values={setup.values}
          value={storedWeight}
          onChange={liveWeight}
          onCommit={commitWeight}
          valueText={spokenWeight}
          rim={colors.rim}
          ink={colors.ink}
          stamp={unit === "KG" ? "KG" : "LB"}
          restIndex={setup.restIndex}
          disabled={completed}
        />
      ) : null}

      {fields.reps ? (
        <div className="wk-panel__row">
          <span className="wk-panel__k type-label" aria-hidden="true">
            Reps
          </span>
          <NumberStrip ref={repsStrip} label={PANEL_COPY.repsFor(ordinal)} values={repOptions} value={storedReps} onChange={liveReps} onCommit={commitReps} valueText={repsSpoken} disabled={completed} />
        </div>
      ) : null}

      {!warmup && (fields.reps || fields.weight) ? (
        <div className="wk-panel__row">
          <span className="wk-panel__k type-label" aria-hidden="true">
            {effortScale}
          </span>
          <div className="wk-effort wk-effort--panel" role="group" aria-label={`${name} ${effortScale}`}>
            {effortOptions(effortScale).map((o) => (
              <button
                key={o.rir}
                type="button"
                className="wk-effort__btn num"
                aria-pressed={set.rir === o.rir}
                aria-label={`${name} ${effortScale} ${o.label}`}
                disabled={completed}
                onClick={() => {
                  onChange({ rir: set.rir === o.rir ? null : o.rir });
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="wk-panel__logrow">
        <button type="button" className={clsx("wk-panel__log type-display-s", flashing && "is-logged", completed && !flashing && "is-reopen")} disabled={!completed && missing} aria-describedby={missing && !completed ? hintId : undefined} onClick={onLog}>
          {flashing ? PANEL_COPY.logged : completed ? PANEL_COPY.reopen : logLabel}
        </button>
        {missing && !completed ? (
          <p id={hintId} className="wk-panel__need">
            {PANEL_COPY.needValue}
          </p>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {flashing ? `Set ${ordinal} logged${weight !== null ? `, ${weight} ${unit === "KG" ? "kilograms" : "pounds"}` : ""}${reps !== null ? `, ${reps} reps` : ""}` : ""}
        </p>
      </div>
    </li>
  );
});
