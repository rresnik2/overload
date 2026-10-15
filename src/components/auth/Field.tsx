import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/** Label + input + hint/error, wired for screen readers. Inputs are 16px+ via auth.css. */
export function Field({ label, hint, error, id, className, ...input }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className="auth-field">
      <label htmlFor={inputId} className="auth-field__label">
        {label}
      </label>
      <input
        id={inputId}
        className={`input ${className ?? ""}`.trim()}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
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
