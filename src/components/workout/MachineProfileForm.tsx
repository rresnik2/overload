"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { MachineProfileCreate, MachineProfileRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import { fromKg, toKg } from "@/lib/units";

export interface MachineProfileFormProps {
  /** Existing profile to edit; omit to create. */
  initial?: MachineProfileRow;
  /** The user's unit, the default for pin step / base load / label unit. */
  unit: WeightUnit;
  /** Fixed exercise link (the picker creates a profile for the exercise being added). */
  exerciseId?: string | null;
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

/** Machine profile fields: name, gym, brand, label unit, pin step, base load. Steps and base load are typed in the label unit and stored in kg. */
export function MachineProfileForm({ initial, unit, exerciseId, extra, linkedExerciseId, submitLabel = "Save machine", onSave, onCancel }: MachineProfileFormProps) {
  const startUnit = initial?.labelUnit ?? unit;
  const [name, setName] = useState(initial?.name ?? "");
  const [gym, setGym] = useState(initial?.gymName ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [labelUnit, setLabelUnit] = useState<WeightUnit>(startUnit);
  const [pinStep, setPinStep] = useState(initial?.pinStepKg != null ? String(fromKg(initial.pinStepKg, startUnit)) : "");
  const [baseLoad, setBaseLoad] = useState(initial?.baseLoadKg != null ? String(fromKg(initial.baseLoadKg, startUnit)) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unitText = labelUnit === "KG" ? "kg" : "lb";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the machine a name.");
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
        pinStepKg: step === null ? null : toKg(step, labelUnit),
        baseLoadKg: base === null ? null : toKg(base, labelUnit),
        notes: initial?.notes ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the machine.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="wk-form" onSubmit={submit} noValidate>
      <Field label="Machine name" labelHint="machineProfile" value={name} onChange={(e) => setName(e.target.value)} placeholder="Hammer Strength chest press" required />
      <div className="wk-form__row">
        <Field label="Gym" value={gym} onChange={(e) => setGym(e.target.value)} />
        <Field label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
      </div>
      <fieldset className="wk-form__units">
        <legend className="field__label">Numbers on the machine are in</legend>
        {(["KG", "LB"] as const).map((u) => (
          <label key={u} className="wk-radio">
            <input type="radio" name="labelUnit" checked={labelUnit === u} onChange={() => setLabelUnit(u)} />
            <span>{u === "KG" ? "Kilograms" : "Pounds"}</span>
          </label>
        ))}
      </fieldset>
      <div className="wk-form__row">
        <Field label={`Pin step (${unitText})`} labelHint="loadStack" kind="weight" value={pinStep} onChange={(e) => setPinStep(e.target.value)} hint="Weight jump between pins" />
        <Field label={`Base load (${unitText})`} labelHint="loadPerSide" kind="weight" value={baseLoad} onChange={(e) => setBaseLoad(e.target.value)} hint="Sled or empty carriage" />
      </div>
      {extra}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="wk-form__actions">
        <Button type="submit" loading={busy}>
          {submitLabel}
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
