"use client";
// Sync status hooks (signatures frozen in CONTRACTS.md).
import { useEffect, useRef, useSyncExternalStore } from "react";
import type { SyncedInfo, SyncStatus } from "@/contracts/sync";
import { IDLE_STATUS, statusStore, syncedListeners } from "./status";

/** Live sync status for SyncPip and "N changes waiting" UI. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(statusStore.subscribe, statusStore.get, () => IDLE_STATUS);
}

/** Calls `callback` after every sync that pushed or pulled something (e.g. to show a PR toast). Stable identity not required. */
export function useOnSynced(callback: (info: SyncedInfo) => void): void {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  useEffect(() => syncedListeners.subscribe((info) => latest.current(info)), []);
}
