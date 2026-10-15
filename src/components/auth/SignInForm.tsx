"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { safeNext } from "@/client/auth/safe-next";
import { useStandaloneIos } from "@/client/auth/use-standalone-ios";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";
import { GoogleButton } from "./GoogleButton";
import { PasskeyButton, useConditionalPasskey } from "./PasskeySignIn";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const standaloneIos = useStandaloneIos();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const done = () => {
    router.push(`/continue?next=${encodeURIComponent(next)}`);
    router.refresh();
  };
  useConditionalPasskey(done);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const result = await authClient.signIn.email({ email, password, callbackURL: "/continue" });
    setPending(false);
    if (result.error) {
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        router.push(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
        return;
      }
      setError(friendlyAuthError(result.error));
      return;
    }
    done();
  }

  const google = googleEnabled ? <GoogleButton next={next} onError={setError} /> : null;
  const passkey = <PasskeyButton onSuccess={done} onError={setError} />;

  return (
    <div className="auth-form">
      {params.get("deleted") ? <FormAlert kind="success">Your account and data were deleted.</FormAlert> : null}
      {params.get("reset") ? <FormAlert kind="success">Password updated. Sign in with the new one.</FormAlert> : null}
      {/* Browser: passkey and Google lead. iPhone home-screen app: passkey and email lead, Google comes last. */}
      {!standaloneIos ? (
        <>
          {passkey}
          {google}
          {google ? <div className="auth-divider">or use email</div> : null}
        </>
      ) : null}
      <form onSubmit={onSubmit} className="auth-form" aria-label="Sign in">
        <Field label="Email" name="email" type="email" autoComplete="username webauthn" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        {error ? <FormAlert>{error}</FormAlert> : null}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Sign in
        </button>
      </form>
      {standaloneIos ? (
        <>
          {passkey}
          {google ? <div className="auth-divider">or</div> : null}
          {google}
        </>
      ) : null}
      <p className="auth-links">
        <Link href="/forgot-password">Forgot your password?</Link>
        <span>
          New here? <Link href="/sign-up">Create an account</Link>
        </span>
      </p>
    </div>
  );
}
