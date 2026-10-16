"use client";
// SyncProvider: opens (and activates) the signed-in user's Dexie database, starts the sync engine, renders children.
// Mounted once, in the (signed-in) layout above the (app) and (workout) groups, so the engine survives moving between them. In development builds it also exposes `window.__overload = { repo, syncNow }`
// for the Playwright specs (never in production: the branch is removed at build time).
import { useEffect, useMemo, type ReactNode } from "react";
import { activateUserDb, setActiveDb } from "@/client/db/active";
import { repo } from "@/client/repo";
import type { SyncProviderProps } from "@/contracts/sync-client";
import { onWorkoutActiveChange } from "@/lib/pwa";
import { createEngine, setActiveEngine, syncNow } from "./engine";
import { ensurePersistentStorage } from "./persist";
import { useRefreshServerDataOnSync } from "./server-refresh-hook";

export function SyncProvider({ userId, children }: SyncProviderProps & { children: ReactNode }) {
  // Activate during render (idempotent, no IO) so child effects and live queries never see a missing database.
  const db = useMemo(() => activateUserDb(userId), [userId]);

  useEffect(() => {
    if (!db) return;
    setActiveDb(db); // re-activate after a StrictMode remount
    const engine = createEngine({ db });
    setActiveEngine(engine);
    engine.start();
    // Ask the browser to keep the offline database: once after sign-in (idle) and once more when the first workout starts.
    const persistTimer = window.setTimeout(() => void ensurePersistentStorage(), 3000);
    const stopWatching = onWorkoutActiveChange((active) => {
      if (active) void ensurePersistentStorage();
    });
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __overload?: unknown }).__overload = { repo, syncNow };
    }
    return () => {
      window.clearTimeout(persistTimer);
      stopWatching();
      engine.stop();
      setActiveEngine(null);
      if (process.env.NODE_ENV !== "production") delete (window as unknown as { __overload?: unknown }).__overload;
    };
  }, [db]);

  useRefreshServerDataOnSync();

  return <>{children}</>;
}
