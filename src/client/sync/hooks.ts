"use client";
// Sync status hooks. STUBS (stream E1 implements; signatures frozen). Safe defaults in Phase 0.
import type { SyncedInfo, SyncStatus } from "@/contracts/sync";

const IDLE_STATUS: SyncStatus = { state: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, rejectedCount: 0 };

/** Live sync status for SyncPip and "N changes waiting" UI. */
export function useSyncStatus(): SyncStatus {
  return IDLE_STATUS;
}

/** Calls `callback` after every sync that pushed or pulled something (e.g. to show a PR toast). Stable identity not required. */
export function useOnSynced(_callback: (info: SyncedInfo) => void): void {
  // no-op in Phase 0
}
