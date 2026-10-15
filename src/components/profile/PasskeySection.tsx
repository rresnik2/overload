"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/client/auth/auth-client";
import { friendlyAuthError } from "@/client/auth/messages";
import { Field } from "@/components/auth/Field";
import { FormAlert } from "@/components/auth/FormAlert";

export function PasskeySection() {
  const { data: passkeys, isPending, refetch } = authClient.useListPasskeys();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setError(null);
    setBusy(true);
    const name = String(new FormData(formEl).get("name") ?? "").trim();
    const result = await authClient.passkey.addPasskey({ name: name || undefined });
    setBusy(false);
    if (result?.error) {
      setError(friendlyAuthError(result.error, "Could not add the passkey."));
      return;
    }
    formEl.reset();
    await refetch();
  }

  async function rename(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setError(null);
    const result = await authClient.passkey.updatePasskey({ id, name });
    if (result.error) setError(friendlyAuthError(result.error));
    setRenaming(null);
    await refetch();
  }

  async function remove(id: string) {
    setError(null);
    const result = await authClient.passkey.deletePasskey({ id });
    if (result.error) setError(friendlyAuthError(result.error));
    await refetch();
  }

  return (
    <div className="settings-form">
      <p>Passkeys sign you in with Face ID, Touch ID or your device PIN: nothing to type, nothing to phish.</p>
      {isPending ? <p className="settings-status">Loading passkeys…</p> : null}
      {passkeys && passkeys.length === 0 ? <p className="settings-status">No passkeys yet.</p> : null}
      {passkeys && passkeys.length > 0 ? (
        <ul className="settings-list" aria-label="Your passkeys">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="settings-list__item">
              {renaming === passkey.id ? (
                <form onSubmit={(e) => rename(passkey.id, e)} className="flex flex-wrap items-end gap-2" aria-label="Rename passkey">
                  <Field label="Passkey name" name="name" type="text" defaultValue={passkey.name ?? ""} maxLength={60} required />
                  <button type="submit" className="btn btn-primary btn-sm">
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span>
                    {passkey.name || "Unnamed passkey"}
                    <span className="settings-status"> · added {passkey.createdAt ? new Date(passkey.createdAt).toLocaleDateString() : "earlier"}</span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenaming(passkey.id)}>
                      Rename
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm text-error" onClick={() => remove(passkey.id)}>
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2" aria-label="Add a passkey">
        <Field label="New passkey name" name="name" type="text" placeholder="iPhone" maxLength={60} />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          Add a passkey
        </button>
      </form>
      {error ? <FormAlert>{error}</FormAlert> : null}
    </div>
  );
}
