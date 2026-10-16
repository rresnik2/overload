import { useId, type FocusEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { InfoHint } from "@/components/ui/InfoHint";
import type { TermId } from "@/lib/glossary";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  /** A glossary term: a small "i" beside the label. */
  labelHint?: TermId;
  error?: string | null;
}

/** Label + input + hint/error, wired for screen readers. Inputs are 16px+ via auth.css. */
export function Field({ label, hint, labelHint, error, id, className, onFocus, ...input }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  // Android Chrome opens the keyboard after the focus event and does not always bring the field above it: once the
  // layout has resized, centre the field (a no-op when it is already comfortably in view).
  const keepInView = (event: FocusEvent<HTMLInputElement>) => {
    onFocus?.(event);
    const el = event.currentTarget;
    window.setTimeout(() => {
      if (document.activeElement === el) el.scrollIntoView({ block: "center", inline: "nearest" });
    }, 300);
  };
  return (
    <div className="auth-field">
      {labelHint ? (
        <div className="field__label-row">
          <label htmlFor={inputId} className="auth-field__label">
            {label}
          </label>
          <InfoHint term={labelHint} />
        </div>
      ) : (
        <label htmlFor={inputId} className="auth-field__label">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`input ${className ?? ""}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        onFocus={keepInView}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="auth-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="auth-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
