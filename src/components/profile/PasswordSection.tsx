"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "@/components/auth/Field";
import { FormAlert } from "@/components/auth/FormAlert";

export function PasswordSection({ hasPassword, email }: { hasPassword: boolean; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError(null);
    setMessage(null);
    const form = new FormData(formEl);
    const newPassword = String(form.get("newPassword") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const result = await authClient.changePassword({ currentPassword: String(form.get("currentPassword") ?? ""), newPassword, revokeOtherSessions: true });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error));
      return;
    }
    formEl.reset();
    setMessage("Password changed. Other devices were signed out.");
  }

  async function sendSetupLink() {
    setError(null);
    setPending(true);
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (result.error) setError(friendlyAuthError(result.error));
    else setMessage(`We emailed a link to ${email} to set a password.`);
  }

  if (!hasPassword) {
    return (
      <div className="settings-form">
        <p>You sign in with Google or a passkey, so there is no password yet. Add one if you want email sign-in too.</p>
        {error ? <FormAlert>{error}</FormAlert> : null}
        {message ? <FormAlert kind="success">{message}</FormAlert> : null}
        <div>
          <button type="button" className="btn btn-outline" onClick={sendSetupLink} disabled={pending}>
            Email me a link to set a password
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={change} className="settings-form" aria-label="Change password">
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <Field label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." required />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      {error ? <FormAlert>{error}</FormAlert> : null}
      {message ? <FormAlert kind="success">{message}</FormAlert> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          Change password
        </button>
      </div>
    </form>
  );
}
