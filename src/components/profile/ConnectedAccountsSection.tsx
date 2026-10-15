"use client";
import { useEffect, useState } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { FormAlert } from "@/components/auth/FormAlert";

interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
}

/** Google link/unlink. Unlinking the last sign-in method is refused by Better Auth. */
export function ConnectedAccountsSection({ googleEnabled }: { googleEnabled: boolean }) {
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  useEffect(() => {
    let alive = true;
    void authClient.listAccounts().then((result) => {
      if (!alive) return;
      if (result.error) setError(friendlyAuthError(result.error));
      else setAccounts(result.data as LinkedAccount[]);
    });
    return () => {
      alive = false;
    };
  }, [version]);

  if (!googleEnabled) return <p className="settings-status">No external sign-in providers are configured.</p>;
  const google = accounts?.find((a) => a.providerId === "google");

  async function link() {
    setError(null);
    const result = await authClient.linkSocial({ provider: "google", callbackURL: "/settings/security" });
    if (result.error) setError(friendlyAuthError(result.error));
  }
  async function unlink() {
    if (!google) return;
    setError(null);
    const result = await authClient.unlinkAccount({ accountId: google.id });
    if (result.error) setError(friendlyAuthError(result.error, "Could not disconnect Google."));
    reload();
  }

  return (
    <div className="settings-form">
      <div className="settings-list__item">
        <span>
          Google
          <span className="settings-status"> · {accounts === null ? "checking…" : google ? "connected" : "not connected"}</span>
        </span>
        {google ? (
          <button type="button" className="btn btn-ghost btn-sm text-error" onClick={unlink}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn btn-outline btn-sm" onClick={link} disabled={accounts === null}>
            Connect Google
          </button>
        )}
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </div>
  );
}
