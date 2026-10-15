"use client";
// Passkey sign-in: conditional UI (browser autofill on the email field, which must carry autocomplete="username webauthn")
// plus an explicit button.
import { useEffect, useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";

export function useConditionalPasskey(onSuccess: () => void) {
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof window === "undefined" || !window.PublicKeyCredential?.isConditionalMediationAvailable) return;
      try {
        if (!(await window.PublicKeyCredential.isConditionalMediationAvailable())) return;
        const result = await authClient.signIn.passkey({ autoFill: true });
        if (!cancelled && result && !result.error) onSuccess();
      } catch {
        // autofill unavailable or dismissed: the explicit button still works
      }
    }
    void start();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);
}

export function PasskeyButton({ onSuccess, onError }: { onSuccess: () => void; onError: (message: string) => void }) {
  const [pending, setPending] = useState(false);
  async function signIn() {
    setPending(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) onError(friendlyAuthError(result.error, "Passkey sign-in failed."));
      else onSuccess();
    } finally {
      setPending(false);
    }
  }
  return (
    <button type="button" className="btn btn-outline" onClick={signIn} disabled={pending}>
      Sign in with a passkey
    </button>
  );
}
