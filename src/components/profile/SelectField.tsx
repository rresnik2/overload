import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  const id = useId();
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-field__label">
        {label}
      </label>
      <select id={id} className="select" aria-invalid={error ? true : undefined} aria-describedby={hint ? `${id}-hint` : undefined} {...select}>
        {children}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="auth-field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="auth-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
