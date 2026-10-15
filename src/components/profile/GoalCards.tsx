"use client";
import Link from "next/link";
import { useId } from "react";
import { InfoHint } from "@/components/ui/InfoHint";
import type { TrainingGoal } from "@/contracts/enums";
import { GOAL_CARDS } from "./choices";

export interface GoalCardsProps {
  name?: string;
  /** Controlled value (onboarding). */
  value?: TrainingGoal | "";
  onChange?: (goal: TrainingGoal) => void;
  /** Uncontrolled initial value (settings form, which reads the radio from FormData). */
  defaultValue?: TrainingGoal | null;
  required?: boolean;
  error?: string | null;
}

/** The goal picker: four radio cards, each saying what the goal changes, with a hint and a link to the comparison article. */
export function GoalCards({ name = "goal", value, onChange, defaultValue, required = true, error }: GoalCardsProps) {
  const errorId = useId();
  const controlled = value !== undefined;
  return (
    <fieldset className="auth-field" aria-describedby={error ? errorId : undefined}>
      <legend className="auth-field__label">Main goal</legend>
      <div className="goal-cards">
        {GOAL_CARDS.map((card, i) => (
          <div key={card.value} className="goal-card-wrap">
            <label className="goal-card">
              <input
                type="radio"
                name={name}
                value={card.value}
                required={required && i === 0}
                {...(controlled ? { checked: value === card.value, onChange: () => onChange?.(card.value) } : { defaultChecked: defaultValue === card.value })}
              />
              <span className="goal-card__title">{card.title}</span>
              <span className="goal-card__summary">{card.summary}</span>
              <span className="goal-card__summary">{card.changes}</span>
            </label>
            <InfoHint term={card.term} className="goal-card__hint" />
          </div>
        ))}
      </div>
      <p className="auth-field__hint">
        The goals overlap, and you can change yours any time.{" "}
        <Link href="/learn/choosing-a-goal" className="link-underline" target="_blank" rel="noopener noreferrer">
          Compare the four goals
        </Link>
      </p>
      {error ? (
        <p id={errorId} role="alert" className="auth-field__error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
