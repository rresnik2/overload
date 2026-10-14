"use client";
// Minimal email + password form (Phase 0). Stream A replaces/extends it (verification, reset, Google, passkeys).
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";

export function CredentialsForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "") || email.split("@")[0] || "Lifter";
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong");
      return;
    }
    const next = params.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/today");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" aria-label={mode === "sign-up" ? "Create account" : "Sign in"}>
      {mode === "sign-up" && (
        <label className="flex flex-col gap-1">
          <span>Name</span>
          <input className="input w-full" name="name" type="text" autoComplete="name" />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input className="input w-full" name="email" type="email" autoComplete="email" required />
      </label>
      <label className="flex flex-col gap-1">
        <span>Password</span>
        <input
          className="input w-full"
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          minLength={10}
          required
        />
      </label>
      {error ? (
        <p role="alert" className="text-error">
          {error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {mode === "sign-up" ? "Create account" : "Sign in"}
      </button>
      <p>
        {mode === "sign-up" ? (
          <>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/sign-up">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}
