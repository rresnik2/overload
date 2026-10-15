"use client";
import { useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";

/** Only rendered by the server when Google is configured (the secret never reaches the client). */
export function GoogleButton({ next, label = "Continue with Google", onError }: { next: string; label?: string; onError: (message: string) => void }) {
  const [pending, setPending] = useState(false);
  async function go() {
    setPending(true);
    const result = await authClient.signIn.social({ provider: "google", callbackURL: `/continue?next=${encodeURIComponent(next)}`, newUserCallbackURL: "/continue" });
    if (result.error) {
      setPending(false);
      onError(friendlyAuthError(result.error));
    }
  }
  return (
    <button type="button" className="btn btn-outline" onClick={go} disabled={pending}>
      {label}
    </button>
  );
}
