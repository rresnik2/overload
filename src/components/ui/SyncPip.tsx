"use client";
import clsx from "clsx";
import { Check, CloudOff, LoaderCircle, LogOut, TriangleAlert } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useSyncStatus } from "@/client/sync";
import type { SyncState } from "@/contracts/sync";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};
const getOnline = () => navigator.onLine;
const getOnlineServer = () => true;

const COPY: Record<SyncState, string> = {
  idle: "Synced",
  syncing: "Syncing",
  offline: "Offline",
  error: "Sync error",
  "signed-out": "Signed out",
};

export interface SyncPipViewProps {
  state: SyncState;
  /** Mutations waiting to upload; shown as "N waiting". */
  pendingCount?: number;
  /** Hide the visible text (the dock shows only the icon); the text stays available to screen readers. */
  compact?: boolean;
  className?: string;
}

/** Presentational pip: icon + text, so the state is never colour alone. */
export function SyncPipView({ state, pendingCount = 0, compact = false, className }: SyncPipViewProps) {
  const Icon = { idle: Check, syncing: LoaderCircle, offline: CloudOff, error: TriangleAlert, "signed-out": LogOut }[state];
  const text = pendingCount > 0 && state !== "idle" && state !== "signed-out" ? `${COPY[state]}, ${pendingCount} waiting` : COPY[state];
  return (
    <span role="status" className={clsx("sync-pip", `sync-pip--${state}`, className)} data-state={state}>
      <Icon size={14} aria-hidden="true" className={state === "syncing" ? "sync-pip__spin" : undefined} />
      <span className={compact ? "sr-only" : "sync-pip__text"}>{text}</span>
    </span>
  );
}

/** Live pip from useSyncStatus() and navigator.onLine (offline wins over idle so a dead connection is never shown as synced). */
export function SyncPip({ compact, className }: Pick<SyncPipViewProps, "compact" | "className">) {
  const status = useSyncStatus();
  const online = useSyncExternalStore(subscribeOnline, getOnline, getOnlineServer);
  const state: SyncState = !online && (status.state === "idle" || status.state === "syncing") ? "offline" : status.state;
  return <SyncPipView state={state} pendingCount={status.pendingCount} compact={compact} className={className} />;
}
