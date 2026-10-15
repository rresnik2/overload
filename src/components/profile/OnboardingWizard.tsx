"use client";
// Four-step onboarding: units and time zone, about you, training, starting numbers. The last step calls the Server Action,
// which validates with a strict schema, writes the Profile and the first BodyMetric, then redirects to /today.
import { useState, useTransition, type FormEvent } from "react";
import { useDetectedTimezone } from "@/client/auth/use-detected-timezone";
import type { ExperienceLevel, Sex, TrainingGoal, WeightUnit } from "@/contracts/enums";
import { round, toKg } from "@/lib/units";
import { completeOnboardingAction } from "@/server/actions/profile";
import { Field } from "@/components/auth/Field";
import { FormAlert } from "@/components/auth/FormAlert";
import { ChoiceGroup } from "./ChoiceGroup";
import { EXPERIENCE_CHOICES, SEX_CHOICES, UNIT_CHOICES } from "./choices";
import { GoalCards } from "./GoalCards";
import { TimezoneField } from "./TimezoneField";

const STEPS = ["Units and region", "About you", "Training", "Starting point"] as const;
const IN_PER_FT = 12;
const CM_PER_IN = 2.54;

interface State {
  unit: WeightUnit | "";
  timezone: string;
  sex: Sex | "";
  birthDate: string;
  heightCm: string;
  heightFt: string;
  heightIn: string;
  experience: ExperienceLevel | "";
  goal: TrainingGoal | "";
  weight: string;
  bodyFat: string;
}

const INITIAL: State = { unit: "", timezone: "", sex: "", birthDate: "", heightCm: "", heightFt: "", heightIn: "", experience: "", goal: "", weight: "", bodyFat: "" };

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<State>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof State>(key: K, value: State[K]) => setState((s) => ({ ...s, [key]: value }));

  // Detected on the client only; an untouched field shows the detected zone.
  const detectedTimezone = useDetectedTimezone();
  const timezone = state.timezone || detectedTimezone;

  const imperial = state.unit === "LB";

  function heightInCm(): number {
    if (imperial) return round((Number(state.heightFt) * IN_PER_FT + Number(state.heightIn || 0)) * CM_PER_IN, 1);
    return Number(state.heightCm);
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    const unit = state.unit as WeightUnit;
    const payload = {
      sex: state.sex,
      birthDate: state.birthDate,
      heightCm: heightInCm(),
      unitPreference: unit,
      experience: state.experience,
      goal: state.goal,
      timezone: timezone.trim(),
      weightKg: round(toKg(Number(state.weight), unit), 2),
      bodyFatPct: state.bodyFat.trim() === "" ? null : Number(state.bodyFat),
    };
    startTransition(async () => {
      const result = await completeOnboardingAction(payload);
      if (result && !result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        // Send the person back to the step that owns the first problem.
        const keys = Object.keys(result.fieldErrors ?? {});
        if (keys.some((k) => k === "timezone")) setStep(0);
        else if (keys.some((k) => k === "sex" || k === "birthDate" || k === "heightCm")) setStep(1);
        else if (keys.some((k) => k === "experience" || k === "goal")) setStep(2);
      }
    });
  }

  return (
    <div>
      <ol className="wizard-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((title, i) => (
          <li key={title} className="wizard-progress__step" data-state={i < step ? "done" : i === step ? "current" : "todo"} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{title}</span>
          </li>
        ))}
      </ol>
      <form onSubmit={next} className="auth-form" aria-label={STEPS[step]} key={step}>
        <h2 className="wizard-step__title">{STEPS[step]}</h2>
        {step === 0 ? (
          <>
            <ChoiceGroup legend="Weight unit" legendHint="units" name="unit" choices={UNIT_CHOICES} value={state.unit} onChange={(v) => set("unit", v)} help="Weights are stored in kilograms and shown in your unit. You can change this later." />
            <TimezoneField value={timezone} onChange={(v) => set("timezone", v)} error={fieldErrors.timezone} />
          </>
        ) : null}
        {step === 1 ? (
          <>
            <ChoiceGroup
              legend="Sex"
              legendHint="sex"
              name="sex"
              choices={SEX_CHOICES}
              value={state.sex}
              onChange={(v) => set("sex", v)}
              help="Only used for formula coefficients and percentile comparisons. Prefer not to say hides percentiles."
            />
            <Field label="Birth date" labelHint="bodyStats" name="birthDate" type="date" value={state.birthDate} onChange={(e) => set("birthDate", e.target.value)} autoComplete="bday" required error={fieldErrors.birthDate} />
            {imperial ? (
              <div className="settings-grid">
                <Field label="Height (ft)" name="heightFt" type="number" inputMode="numeric" min={3} max={8} step={1} value={state.heightFt} onChange={(e) => set("heightFt", e.target.value)} required />
                <Field label="Height (in)" name="heightIn" type="number" inputMode="decimal" min={0} max={11.9} step={0.5} value={state.heightIn} onChange={(e) => set("heightIn", e.target.value)} />
              </div>
            ) : (
              <Field label="Height (cm)" name="heightCm" type="number" inputMode="decimal" min={50} max={260} step={0.5} value={state.heightCm} onChange={(e) => set("heightCm", e.target.value)} required error={fieldErrors.heightCm} />
            )}
          </>
        ) : null}
        {step === 2 ? (
          <>
            <ChoiceGroup legend="Training experience" legendHint="experienceLevel" name="experience" choices={EXPERIENCE_CHOICES} value={state.experience} onChange={(v) => set("experience", v)} />
            <GoalCards value={state.goal} onChange={(v) => set("goal", v)} error={fieldErrors.goal} />
          </>
        ) : null}
        {step === 3 ? (
          <>
            <Field
              label={`Bodyweight (${imperial ? "lb" : "kg"})`}
              name="weight"
              type="number"
              inputMode="decimal"
              min={imperial ? 45 : 20}
              max={imperial ? 1100 : 500}
              step={0.1}
              value={state.weight}
              onChange={(e) => set("weight", e.target.value)}
              required
              error={fieldErrors.weightKg}
              hint="Your first bodyweight entry. Charts and relative-strength scores start from it."
              labelHint="bodyweightTrend"
            />
            <Field label="Body fat % (optional)" labelHint="bodyFatMethods" name="bodyFat" type="number" inputMode="decimal" min={1} max={75} step={0.1} value={state.bodyFat} onChange={(e) => set("bodyFat", e.target.value)} error={fieldErrors.bodyFatPct} />
          </>
        ) : null}
        {error ? <FormAlert>{error}</FormAlert> : null}
        <div className="wizard-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)} disabled={pending}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {step === STEPS.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
      </form>
    </div>
  );
}
