import { useId } from "react";
import { InfoHint } from "@/components/ui/InfoHint";
import type { TermId } from "@/lib/glossary";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Radio cards (native radios, so keyboard and screen readers work). */
export function ChoiceGroup<T extends string>({
  legend,
  name,
  choices,
  value,
  onChange,
  required = true,
  help,
  legendHint,
}: {
  legend: string;
  name: string;
  choices: readonly Choice<T>[];
  value: T | "";
  onChange: (value: T) => void;
  required?: boolean;
  help?: string;
  /** A glossary term: a small "i" beside the legend. */
  legendHint?: TermId;
}) {
  const helpId = useId();
  return (
    <fieldset className="auth-field" aria-describedby={help ? helpId : undefined}>
      <legend className="auth-field__label">
        {legend}
        {legendHint ? <InfoHint term={legendHint} /> : null}
      </legend>
      <div className="wizard-choices">
        {choices.map((choice, i) => (
          <label key={choice.value} className="wizard-choice">
            <input
              type="radio"
              className="radio radio-sm"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              required={required && i === 0}
            />
            <span className="wizard-choice__text">
              <span>{choice.label}</span>
              {choice.hint ? <span className="wizard-choice__hint">{choice.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {help ? (
        <p id={helpId} className="auth-field__hint">
          {help}
        </p>
      ) : null}
    </fieldset>
  );
}
