"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { FormAlert } from "@/components/auth/FormAlert";
import { Button } from "@/components/ui/Button";

/**
 * Ends this device's session. The local Dexie database is per user and stays on the device (pending changes sync after the
 * next sign-in), so a different person signing in here never sees it.
 */
export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setBusy(true);
    setError(null);
    const result = await authClient.signOut();
    if (result.error) {
      setError(friendlyAuthError(result.error, "Could not sign out. Check your connection and try again."));
      setBusy(false);
      return;
    }
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="settings-signout">
      <Button variant="ink" loading={busy} icon={<LogOut size={18} />} onClick={() => void signOut()}>
        Sign out
      </Button>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </div>
  );
}
