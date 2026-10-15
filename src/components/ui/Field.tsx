import clsx from "clsx";
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

export type FieldKind = "text" | "number" | "weight" | "reps" | "rir";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "children"> {
  label: string;
  /** text (default) | number | weight (decimal keypad + unit suffix) | reps (integer keypad) | rir (integer 0-10). */
  kind?: FieldKind;
  /** Short trailing unit ("kg", "lb", "reps"), shown inside the field. Weight fields should pass the user's unit. */
  unit?: string;
  hint?: ReactNode;
  /** An error message; sets aria-invalid and links the message with aria-describedby. */
  error?: ReactNode;
  /** Hide the label visually but keep it for screen readers (e.g. a set-row input). */
  hideLabel?: boolean;
}

const KIND_ATTRS: Record<FieldKind, Pick<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "pattern">> = {
  text: {},
  number: { type: "number", inputMode: "decimal" },
  weight: { type: "text", inputMode: "decimal", pattern: "[0-9]*[.,]?[0-9]*" },
  reps: { type: "text", inputMode: "numeric", pattern: "[0-9]*" },
  rir: { type: "text", inputMode: "numeric", pattern: "[0-9]*" },
};

/** Labelled text input. Always at least 16px (iOS does not zoom), 44px tall, vermilion focus ring. Server-renderable. */
export function Field({ label, kind = "text", unit, hint, error, hideLabel = false, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  const errId = `${inputId}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null, rest["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("field", error && "field--error", rest.disabled && "field--disabled", className)}>
      <label htmlFor={inputId} className={clsx("field__label", hideLabel && "sr-only")}>
        {label}
      </label>
      <div className="field__control">
        <input
          id={inputId}
          className={clsx("field__input", kind !== "text" && "num")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...KIND_ATTRS[kind]}
          {...rest}
          type={rest.type ?? KIND_ATTRS[kind].type ?? "text"}
        />
        {unit ? (
          <span className="field__unit" aria-hidden="true">
            {unit}
          </span>
        ) : null}
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
