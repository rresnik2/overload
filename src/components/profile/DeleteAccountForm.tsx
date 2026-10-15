"use client";
import { useState, useTransition, type FormEvent } from "react";
import { Field } from "@/components/auth/Field";
import { FormAlert } from "@/components/auth/FormAlert";
import { deleteAccountAction } from "@/server/actions/profile";

export const DELETE_PHRASE = "delete my account";

export function DeleteAccountForm({ needsPassword }: { needsPassword: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    startTransition(async () => {
      const result = await deleteAccountAction({ confirmation: String(form.get("confirmation") ?? ""), ...(password ? { password } : {}) });
      if (result && !result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="settings-form" aria-label="Delete account">
      <p>
        This permanently deletes your account, workouts, templates, measurements and insights. It cannot be undone. Download your data first if you want a copy.
      </p>
      <Field label={`Type "${DELETE_PHRASE}" to confirm`} name="confirmation" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} required error={fieldErrors.confirmation} />
      {needsPassword ? <Field label="Password" name="password" type="password" autoComplete="current-password" required error={fieldErrors.password} /> : <p className="auth-field__hint">You need to have signed in within the last 10 minutes.</p>}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div>
        <button type="submit" className="btn btn-error" disabled={pending}>
          Delete my account
        </button>
      </div>
    </form>
  );
}
