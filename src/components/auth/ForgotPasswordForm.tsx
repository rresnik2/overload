"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error));
      return;
    }
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="auth-form">
        <FormAlert kind="success">If an account exists for {sentTo}, a reset link is on its way. It expires in one hour.</FormAlert>
        <p className="auth-links">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-form" aria-label="Reset password">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        Send reset link
      </button>
      <p className="auth-links">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </form>
  );
}
