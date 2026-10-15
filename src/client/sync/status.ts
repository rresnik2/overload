// Tiny external stores: the sync status behind `useSyncStatus` and the listeners behind `useOnSynced`.
import type { SyncedInfo, SyncStatus } from "@/contracts/sync";

export const IDLE_STATUS: SyncStatus = { state: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, rejectedCount: 0 };

export interface StatusStore {
  get(): SyncStatus;
  set(patch: Partial<SyncStatus>): void;
  subscribe(listener: () => void): () => void;
}

export function createStatusStore(initial: SyncStatus = IDLE_STATUS): StatusStore {
  let status = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => status,
    set(patch) {
      const next = { ...status, ...patch };
      if ((Object.keys(next) as (keyof SyncStatus)[]).every((k) => next[k] === status[k])) return;
      status = next; // a new object only when something changed: useSyncExternalStore snapshots stay stable
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export interface SyncedListeners {
  emit(info: SyncedInfo): void;
  subscribe(listener: (info: SyncedInfo) => void): () => void;
}

export function createSyncedListeners(): SyncedListeners {
  const listeners = new Set<(info: SyncedInfo) => void>();
  return {
    emit(info) {
      for (const l of [...listeners]) l(info);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The app-wide instances (one engine runs at a time). */
export const statusStore = createStatusStore();
export const syncedListeners = createSyncedListeners();
