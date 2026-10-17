"use client";
import clsx from "clsx";
import { Check, CloudOff, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { requireActiveDb } from "@/client/db/active";
import { syncNow, useSyncStatus } from "@/client/sync";
import { statusStore } from "@/client/sync/status";
import { useUnsyncedRows } from "@/client/sync/unsynced";
import type { SyncStatus } from "@/contracts/sync";

/** What the button says. Pure, so the wording is tested without a database. `pending` is the number of rows with unsent changes. */
export function syncNowLabel(status: Pick<SyncStatus, "state">, pending: number): string {
  switch (status.state) {
    case "syncing":
      return "Syncing…";
    case "signed-out":
      return "Signed out";
    case "offline":
      return pending > 0 ? `Offline, ${pending} unsynced` : "Offline";
    case "error":
      return "Sync failed. Tap to retry";
    default:
      return pending > 0 ? `${pending} unsynced` : "Synced";
  }
}

/** What a screen reader hears after a tap. Says where the data is when the sync did not go through. */
export function syncNowAnnouncement(status: Pick<SyncStatus, "state">, pending: number): string {
  switch (status.state) {
    case "idle":
      return pending > 0 ? `Synced. ${pending} still unsynced.` : "Synced. Everything is saved to your account.";
    case "offline":
      return "Offline. Your sets are saved on this phone and will sync when you are back online.";
    case "signed-out":
      return "Signed out. Your sets are saved on this phone. Sign in to sync them.";
    case "error":
      return "Sync failed. Your sets are saved on this phone. Tap to try again.";
    default:
      return "Syncing.";
  }
}

/**
 * The manual sync control of the workout bar. During a workout the app syncs in the background at most every 5 minutes, so this is
 * how the lifter pushes sooner: it shows how many rows are waiting, and one tap syncs now. The state is always in the text, never
 * colour alone. The announcement is read only after a tap, so background updates stay quiet.
 */
export function SyncNow({ className }: { className?: string }) {
  const status = useSyncStatus();
  const pending = useUnsyncedRows() ?? 0;
  const [announcement, setAnnouncement] = useState("");
  const [tapped, setTapped] = useState(false);

  const busy = status.state === "syncing";
  const label = syncNowLabel(status, pending);
  const Icon = busy ? LoaderCircle : status.state === "error" || status.state === "signed-out" ? TriangleAlert : status.state === "offline" ? CloudOff : pending > 0 ? RefreshCw : Check;

  const onClick = async () => {
    if (busy) return;
    setTapped(true);
    setAnnouncement("Syncing.");
    await syncNow("manual");
    const left = (await requireActiveDb().outbox.orderBy("[entity+id]").uniqueKeys()).length;
    setAnnouncement(syncNowAnnouncement(statusStore.get(), left));
  };

  return (
    <div className={clsx("wk-sync", className)}>
      <button type="button" className="wk-sync__btn" data-state={status.state} data-pending={pending > 0 ? "" : undefined} aria-label={`Sync now: ${label}`} aria-disabled={busy || undefined} onClick={() => void onClick()}>
        <Icon size={16} aria-hidden="true" className={busy ? "sync-pip__spin" : undefined} />
        <span className="num">{label}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {tapped ? announcement : ""}
      </span>
    </div>
  );
}
