"use client";
import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { InfoHint } from "@/components/ui/InfoHint";
import type { MachineProfileCreate, MachineProfileRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import { fromKg, round, toKg } from "@/lib/units";
import { PLATES } from "./plates";

export interface MachineProfileFormProps {
  /** "machine" (default): a pin-loaded or plate-loaded machine. "bar": the lifter's bar and plates for a barbell exercise (D1, D6). */
  kind?: "machine" | "bar";
  /** Existing profile to edit; omit to create. */
  initial?: MachineProfileRow;
  /** The user's unit, the default for pin step / base load / label unit. */
  unit: WeightUnit;
  /** Fixed exercise link (the picker creates a profile for the exercise being added). */
  exerciseId?: string | null;
  /** Name to start a new profile with (a bar profile is named after its exercise). */
  defaultName?: string;
  /** Show the plate checkboxes. Always on for a bar; plate-loaded machines and Smith machines opt in. */
  plates?: boolean;
  /** Extra controls under the fields (e.g. a linked-exercise selector). Receives nothing: the parent owns that state. */
  extra?: React.ReactNode;
  /** The exercise id chosen through `extra`, when exerciseId is not fixed. */
  linkedExerciseId?: string | null;
  submitLabel?: string;
  onSave: (fields: MachineProfileCreate) => Promise<void> | void;
  onCancel?: () => void;
}

const num = (text: string): number | null => {
  const n = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

/** Plate sizes offered as checkboxes: the standard set plus the small fractional plate gyms often have (0.5 kg, 1 lb). */
const EXTRA_PLATE: Record<WeightUnit, number> = { KG: 0.5, LB: 1 };
const standardPlates = (unit: WeightUnit): number[] => PLATES[unit].map((p) => p.weight);
const plateOptions = (unit: WeightUnit): number[] => [...standardPlates(unit), EXTRA_PLATE[unit]];
const sameSet = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x) => b.some((y) => Math.abs(x - y) < 1e-6));

/**
 * Machine profile fields: name, gym, brand, label unit, pin step, base load. Steps and base load are typed in the label unit and
 * stored in kg. `kind="bar"` is the barbell version: "Bar weight" instead of "Base load" (no pin step, gym or brand) and a
 * checkbox for each plate size the gym has. A selection equal to the standard set is stored as null ("the standard set").
 */
export function MachineProfileForm({ kind = "machine", initial, unit, exerciseId, defaultName, plates: showPlates, extra, linkedExerciseId, submitLabel, onSave, onCancel }: MachineProfileFormProps) {
  const bar = kind === "bar";
  const withPlates = bar || showPlates === true;
  const startUnit = initial?.labelUnit ?? unit;
  const [name, setName] = useState(initial?.name ?? defaultName ?? "");
  const [gym, setGym] = useState(initial?.gymName ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [labelUnit, setLabelUnit] = useState<WeightUnit>(startUnit);
  const [pinStep, setPinStep] = useState(initial?.pinStepKg != null ? String(fromKg(initial.pinStepKg, startUnit)) : "");
  const [baseLoad, setBaseLoad] = useState(initial?.baseLoadKg != null ? String(fromKg(initial.baseLoadKg, startUnit)) : "");
  // The plates owned, in the label unit. A profile without an inventory starts as the standard set.
  const [owned, setOwned] = useState<number[]>(() => (initial?.platesKg && initial.platesKg.length > 0 ? initial.platesKg.map((kg) => round(fromKg(kg, startUnit), 2)) : standardPlates(startUnit)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unitText = labelUnit === "KG" ? "kg" : "lb";

  // The checkbox list: the usual sizes, plus any odd size the profile already has.
  const options = [...plateOptions(labelUnit), ...owned.filter((w) => !plateOptions(labelUnit).some((o) => Math.abs(o - w) < 1e-6))].sort((a, b) => b - a);
  const toneOf = (w: number) => PLATES[labelUnit].find((p) => Math.abs(p.weight - w) < 1e-6)?.tone ?? "chrome";

  const changeUnit = (next: WeightUnit) => {
    if (next === labelUnit) return;
    setLabelUnit(next);
    // Plate sizes differ between kg and lb: switching starts again from that unit's standard set.
    setOwned(standardPlates(next));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError(bar ? "Give the bar a name." : "Give the machine a name.");
    if (withPlates && owned.length === 0) return setError("Tick at least one plate size.");
    const step = num(pinStep);
    const base = num(baseLoad);
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        gymName: gym.trim() || null,
        brand: brand.trim() || null,
        exerciseId: exerciseId !== undefined ? exerciseId : (linkedExerciseId ?? null),
        labelUnit,
        pinStepKg: bar ? (initial?.pinStepKg ?? null) : step === null ? null : toKg(step, labelUnit),
        baseLoadKg: base === null ? null : toKg(base, labelUnit),
        platesKg: withPlates ? (sameSet(owned, standardPlates(labelUnit)) ? null : [...owned].sort((a, b) => b - a).map((w) => toKg(w, labelUnit))) : (initial?.platesKg ?? null),
        notes: initial?.notes ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : bar ? "Could not save the bar." : "Could not save the machine.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="wk-form" onSubmit={submit} noValidate>
      {bar ? (
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My barbell" required />
      ) : (
        <Field label="Machine name" labelHint="machineProfile" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hammer Strength chest press" required />
      )}
      {bar ? null : (
        <div className="wk-form__row">
          <Field label="Gym" value={gym} onChange={(e) => setGym(e.target.value)} />
          <Field label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
      )}
      <fieldset className="wk-form__units">
        <legend className="field__label">{bar ? "Weights are in" : "Numbers on the machine are in"}</legend>
        {(["KG", "LB"] as const).map((u) => (
          <label key={u} className="wk-radio">
            <input type="radio" name="labelUnit" checked={labelUnit === u} onChange={() => changeUnit(u)} />
            <span>{u === "KG" ? "Kilograms" : "Pounds"}</span>
          </label>
        ))}
      </fieldset>
      {bar ? (
        <Field label={`Bar weight (${unitText})`} labelHint="barProfile" kind="weight" value={baseLoad} onChange={(e) => setBaseLoad(e.target.value)} hint="Empty bar. Leave blank for the standard bar" />
      ) : (
        <div className="wk-form__row">
          <Field label={`Pin step (${unitText})`} labelHint="loadStack" kind="weight" value={pinStep} onChange={(e) => setPinStep(e.target.value)} hint="Weight jump between pins" />
          <Field label={`Base load (${unitText})`} labelHint="loadPerSide" kind="weight" value={baseLoad} onChange={(e) => setBaseLoad(e.target.value)} hint="Sled or empty carriage" />
        </div>
      )}
      {withPlates ? (
        <fieldset className="wk-form__plates">
          <legend className="field__label wk-form__legend">
            Plates you have
            <InfoHint term="plateInventory" />
          </legend>
          <div className="wk-plates">
            {options.map((w) => {
              const on = owned.some((o) => Math.abs(o - w) < 1e-6);
              return (
                <label key={w} className={clsx("wk-plate-chip", on && "is-on")} data-tone={toneOf(w)}>
                  <input
                    type="checkbox"
                    checked={on}
                    aria-label={`${w} ${unitText} plate`}
                    onChange={() => setOwned((cur) => (on ? cur.filter((o) => Math.abs(o - w) >= 1e-6) : [...cur, w]))}
                  />
                  <i className="eq__dot" style={{ background: `var(--plate-${toneOf(w)})` }} aria-hidden="true" />
                  <span className="num">{w}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      {extra}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="wk-form__actions">
        <Button type="submit" loading={busy}>
          {submitLabel ?? (bar ? "Save bar and plates" : "Save machine")}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
