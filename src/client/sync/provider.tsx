"use client";
// SyncProvider: opens (and activates) the signed-in user's Dexie database, starts the sync engine, renders children.
// Mounted in the (app) and (workout) layouts. In development builds it also exposes `window.__overload = { repo, syncNow }`
// for the Playwright specs (never in production: the branch is removed at build time).
import { useEffect, useMemo, type ReactNode } from "react";
import { activateUserDb, setActiveDb } from "@/client/db/active";
import { repo } from "@/client/repo";
import type { SyncProviderProps } from "@/contracts/sync-client";
import { createEngine, setActiveEngine, syncNow } from "./engine";

export function SyncProvider({ userId, children }: SyncProviderProps & { children: ReactNode }) {
  // Activate during render (idempotent, no IO) so child effects and live queries never see a missing database.
  const db = useMemo(() => activateUserDb(userId), [userId]);

  useEffect(() => {
    if (!db) return;
    setActiveDb(db); // re-activate after a StrictMode remount
    const engine = createEngine({ db });
    setActiveEngine(engine);
    engine.start();
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __overload?: unknown }).__overload = { repo, syncNow };
    }
    return () => {
      engine.stop();
      setActiveEngine(null);
      if (process.env.NODE_ENV !== "production") delete (window as unknown as { __overload?: unknown }).__overload;
    };
  }, [db]);

  return <>{children}</>;
}
