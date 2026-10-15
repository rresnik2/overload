"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { ProfileRow } from "@/contracts/entities";
import type { E1rmFormula, EffortScale, ExperienceLevel, Sex, TrainingGoal, WeightUnit } from "@/contracts/enums";
import { Field } from "@/components/auth/Field";
import { FormAlert } from "@/components/auth/FormAlert";
import { updateProfileAction } from "@/server/actions/profile";
import { SelectField } from "./SelectField";
import { TimezoneField } from "./TimezoneField";

const orNull = <T extends string>(value: FormDataEntryValue | null): T | null => (value && String(value) !== "" ? (String(value) as T) : null);

export function ProfileForm({ initial }: { initial: ProfileRow }) {
  const [timezone, setTimezone] = useState(initial.timezone);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const height = String(form.get("heightCm") ?? "").trim();
    const payload = {
      sex: orNull<Sex>(form.get("sex")),
      birthDate: String(form.get("birthDate") ?? "") || null,
      heightCm: height === "" ? null : Number(height),
      unitPreference: String(form.get("unitPreference")) as WeightUnit,
      effortScale: String(form.get("effortScale")) as EffortScale,
      experience: orNull<ExperienceLevel>(form.get("experience")),
      goal: orNull<TrainingGoal>(form.get("goal")),
      e1rmFormula: String(form.get("e1rmFormula")) as E1rmFormula,
      timezone: timezone.trim(),
      defaultRestSec: Number(form.get("defaultRestSec")),
      insightsEnabled: form.get("insightsEnabled") === "on",
    };
    startTransition(async () => {
      const result = await updateProfileAction(payload);
      if (result.ok) {
        setFieldErrors({});
        setSaved(true);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="settings-form" aria-label="Profile">
      <div className="settings-grid">
        <SelectField label="Sex" name="sex" defaultValue={initial.sex ?? ""} hint="Only used for formula coefficients and percentiles. Prefer not to say hides percentiles." error={fieldErrors.sex}>
          <option value="">Not set</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
        </SelectField>
        <Field label="Birth date" name="birthDate" type="date" defaultValue={initial.birthDate ?? ""} error={fieldErrors.birthDate} />
        <Field label="Height (cm)" name="heightCm" type="number" inputMode="decimal" min={50} max={260} step={0.5} defaultValue={initial.heightCm ?? ""} error={fieldErrors.heightCm} />
        <SelectField label="Experience" name="experience" defaultValue={initial.experience ?? ""} error={fieldErrors.experience}>
          <option value="">Not set</option>
          <option value="BEGINNER">Beginner</option>
          <option value="INTERMEDIATE">Intermediate</option>
          <option value="ADVANCED">Advanced</option>
        </SelectField>
        <SelectField label="Goal" name="goal" defaultValue={initial.goal ?? ""} error={fieldErrors.goal}>
          <option value="">Not set</option>
          <option value="HYPERTROPHY">Build muscle</option>
          <option value="STRENGTH">Get stronger</option>
          <option value="GENERAL">General fitness</option>
        </SelectField>
        <SelectField label="Weight unit" name="unitPreference" defaultValue={initial.unitPreference}>
          <option value="KG">Kilograms</option>
          <option value="LB">Pounds</option>
        </SelectField>
        <SelectField label="Effort scale" name="effortScale" defaultValue={initial.effortScale} hint="RIR counts reps in reserve. RPE is 10 minus RIR. Stored as RIR either way.">
          <option value="RIR">RIR (reps in reserve)</option>
          <option value="RPE">RPE (rate of perceived exertion)</option>
        </SelectField>
        <SelectField label="Estimated 1RM formula" name="e1rmFormula" defaultValue={initial.e1rmFormula} hint="Changes how e1RM is calculated everywhere.">
          <option value="EPLEY">Epley</option>
          <option value="BRZYCKI">Brzycki</option>
        </SelectField>
        <Field label="Default rest (seconds)" name="defaultRestSec" type="number" inputMode="numeric" min={0} max={3600} step={5} defaultValue={initial.defaultRestSec} required error={fieldErrors.defaultRestSec} />
      </div>
      <TimezoneField value={timezone} onChange={setTimezone} error={fieldErrors.timezone} />
      <label className="flex min-h-[var(--tap-target)] items-center gap-3">
        <input type="checkbox" className="checkbox" name="insightsEnabled" defaultChecked={initial.insightsEnabled} />
        <span>Weekly insights (written summaries of your training)</span>
      </label>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {saved ? <FormAlert kind="success">Saved.</FormAlert> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Save profile
        </button>
      </div>
    </form>
  );
}
