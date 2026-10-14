"use client";
// SyncProvider. STUB (stream E1 implements; props frozen). Mount once in the (app) and (workout) layouts.
// It opens the per-user Dexie database (`overload-<userId>`), starts the engine triggers, and renders children.
import type { ReactNode } from "react";
import type { SyncProviderProps } from "@/contracts/sync-client";

export function SyncProvider({ children }: SyncProviderProps & { children: ReactNode }) {
  return <>{children}</>;
}
