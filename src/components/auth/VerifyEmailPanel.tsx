"use client";
import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "./Field";
import { FormAlert } from "./FormAlert";

export function VerifyEmailPanel({ email, sent, linkProblem }: { email: string | null; sent: boolean; linkProblem: boolean }) {
  const [address, setAddress] = useState(email ?? "");
  const [status, setStatus] = useState<"idle" | "pending" | "sent">(sent ? "sent" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setError(null);
    setStatus("pending");
    const result = await authClient.sendVerificationEmail({ email: address.trim(), callbackURL: "/continue" });
    if (result.error) {
      setStatus("idle");
      setError(friendlyAuthError(result.error));
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="auth-form">
      {linkProblem ? <FormAlert>That confirmation link is invalid or has expired. Request a new one below.</FormAlert> : null}
      {status === "sent" ? (
        <FormAlert kind="success">
          {address ? <>We sent a confirmation link to {address}.</> : <>We sent a confirmation link.</>} It expires in one hour.
        </FormAlert>
      ) : null}
      <p>Open the link in that email to confirm your address. You will be signed in and taken to setup.</p>
      {!email ? <Field label="Email" type="email" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="email" /> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      <button type="button" className="btn btn-outline" onClick={resend} disabled={status === "pending" || !address.trim()}>
        Send a new link
      </button>
      <p className="auth-links">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
