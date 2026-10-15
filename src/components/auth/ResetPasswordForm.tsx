"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? friendlyAuthError({ code: "INVALID_TOKEN" }) : null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("confirm") ?? "")) {
      setError("The two passwords do not match.");
      return;
    }
    setPending(true);
    const result = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error));
      return;
    }
    router.push("/sign-in?reset=1");
  }

  if (!token) {
    return (
      <div className="auth-form">
        <FormAlert>{error ?? "This reset link is missing its token. Request a new one."}</FormAlert>
        <p className="auth-links">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="auth-form" aria-label="Choose a new password">
      <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." required />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      {error ? <FormAlert>{error}</FormAlert> : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        Update password
      </button>
    </form>
  );
}
