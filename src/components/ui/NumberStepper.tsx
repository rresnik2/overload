"use client";
import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export interface NumberStepperProps {
  label: string;
  /** Current value, or null when empty. */
  value: number | null;
  onChange: (next: number | null) => void;
  /** Amount of one tap on - / +. Callers fill this from `defaultIncrement()` (src/lib/units.ts). */
  step: number;
  /** weight = decimal keypad, reps/rir = integer keypad. Default "weight". */
  kind?: "weight" | "reps" | "rir";
  min?: number;
  max?: number;
  /** Trailing unit ("kg"). */
  unit?: string;
  hint?: ReactNode;
  error?: ReactNode;
  disabled?: boolean;
  hideLabel?: boolean;
  className?: string;
  id?: string;
}

const clamp = (n: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
const fmt = (n: number | null) => (n === null ? "" : String(n));

/**
 * Text input flanked by 44px - / + buttons. Typing is free-form (decimal or integer per `kind`); the value commits
 * on every valid keystroke and the text snaps to the committed number on blur. States: default, focus, error, disabled.
 */
export function NumberStepper({ label, value, onChange, step, kind = "weight", min = 0, max, unit, hint, error, disabled, hideLabel, className, id }: NumberStepperProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;
  // While the field has focus `draft` holds exactly what was typed ("8." or "" mid-edit); otherwise the value is the truth.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (n: number | null) => {
    // toFixed(3) removes 0.1 + 0.2 float noise (weights are stored with 3 decimals).
    const next = n === null ? null : Number(clamp(n, min, max).toFixed(3));
    onChange(next);
    setDraft((cur) => (cur === null ? null : fmt(next)));
  };
  const bump = (dir: 1 | -1) => commit((value ?? 0) + dir * step);

  const parse = (raw: string) => {
    const cleaned = raw.replace(",", ".");
    if (cleaned === "") return { ok: true as const, n: null };
    const re = kind === "weight" ? /^\d*\.?\d*$/ : /^\d*$/;
    if (!re.test(cleaned) || cleaned === ".") return { ok: false as const };
    return { ok: true as const, n: Number(cleaned) };
  };

  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  const atMin = value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  return (
    <div className={clsx("field stepper", error && "field--error", disabled && "field--disabled", className)}>
      <label htmlFor={inputId} className={clsx("field__label", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="stepper__row">
        <button type="button" className="stepper__btn" aria-label={`Decrease ${label}`} disabled={disabled || atMin} onClick={() => bump(-1)}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <div className="field__control stepper__control">
          <input
            id={inputId}
            className="field__input num stepper__input"
            type="text"
            inputMode={kind === "weight" ? "decimal" : "numeric"}
            autoComplete="off"
            value={draft ?? fmt(value)}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onFocus={() => setDraft(fmt(value))}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const p = parse(e.target.value);
              if (!p.ok) return;
              setDraft(e.target.value);
              onChange(p.n === null ? null : clamp(p.n, min, max));
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                bump(1);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                bump(-1);
              }
            }}
          />
          {unit ? (
            <span className="field__unit" aria-hidden="true">
              {unit}
            </span>
          ) : null}
        </div>
        <button type="button" className="stepper__btn" aria-label={`Increase ${label}`} disabled={disabled || atMax} onClick={() => bump(1)}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
