"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";
import { GoogleButton } from "./GoogleButton";

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim() || email.split("@")[0] || "Lifter";
    const result = await authClient.signUp.email({ email, password, name, callbackURL: "/continue" });
    setPending(false);
    if (result.error) {
      setError(friendlyAuthError(result.error));
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
  }

  return (
    <div className="auth-form">
      {googleEnabled ? (
        <>
          <GoogleButton next="/onboarding" label="Sign up with Google" onError={setError} />
          <div className="auth-divider">or use email</div>
        </>
      ) : null}
      <form onSubmit={onSubmit} className="auth-form" aria-label="Create account">
        <Field label="Name" name="name" type="text" autoComplete="name" />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={10} hint="At least 10 characters." required />
        {error ? <FormAlert>{error}</FormAlert> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Create account
        </button>
      </form>
      <p className="auth-links">
        <span>
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </span>
      </p>
    </div>
  );
}
