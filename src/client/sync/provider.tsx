"use client";
// SyncProvider: opens (and activates) the signed-in user's Dexie database, starts the sync engine, renders children.
// Mounted in the (app) and (workout) layouts. In development builds it also exposes `window.__overload = { repo, syncNow }`
// for the Playwright specs (never in production: the branch is removed at build time).
//
// The engine outlives a provider: moving between the (app) and (workout) groups unmounts one provider and mounts the other (they are
// sibling layouts, and moving the route folders under a shared parent is blocked by the frozen ownership map), and a restart would
// send a start-of-app sync and re-create every listener each time. Providers therefore LEASE the engine of their database: the
// last one to leave stops it after a short grace period, and one that arrives within it takes the running engine over.
import { useEffect, useMemo, type ReactNode } from "react";
import { activateUserDb, setActiveDb } from "@/client/db/active";
import type { OverloadDb } from "@/client/db/schema";
import { repo } from "@/client/repo";
import type { SyncProviderProps } from "@/contracts/sync-client";
import { onWorkoutActiveChange } from "@/lib/pwa";
import { createEngine, setActiveEngine, syncNow, type Engine } from "./engine";
import { ensurePersistentStorage } from "./persist";
import { useRefreshServerDataOnSync } from "./server-refresh-hook";

/** How long an engine with no provider is kept before it stops: longer than a client-side navigation between the two groups. */
export const ENGINE_GRACE_MS = 1_500;

interface Lease {
  db: OverloadDb;
  engine: Engine;
  users: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
  disposers: (() => void)[];
}
let lease: Lease | null = null;

function acquire(db: OverloadDb): Lease {
  if (lease && lease.db === db) {
    if (lease.stopTimer) clearTimeout(lease.stopTimer);
    lease.stopTimer = null;
    lease.users += 1;
    return lease;
  }
  if (lease) dispose(lease); // another user's database: that engine must not keep running
  const engine = createEngine({ db });
  setActiveEngine(engine);
  engine.start();
  // Ask the browser to keep the offline database: once after sign-in (idle) and once more when the first workout starts.
  const persistTimer = setTimeout(() => void ensurePersistentStorage(), 3000);
  const stopWatching = onWorkoutActiveChange((active) => {
    if (active) void ensurePersistentStorage();
  });
  lease = { db, engine, users: 1, stopTimer: null, disposers: [() => clearTimeout(persistTimer), stopWatching] };
  return lease;
}

function dispose(l: Lease): void {
  if (l.stopTimer) clearTimeout(l.stopTimer);
  for (const fn of l.disposers) fn();
  l.engine.stop();
  setActiveEngine(null);
  if (lease === l) lease = null;
}

function release(l: Lease): void {
  l.users -= 1;
  if (l.users > 0 || l.stopTimer) return;
  l.stopTimer = setTimeout(() => {
    if (l.users === 0) dispose(l);
  }, ENGINE_GRACE_MS);
}

export function SyncProvider({ userId, children }: SyncProviderProps & { children: ReactNode }) {
  // Activate during render (idempotent, no IO) so child effects and live queries never see a missing database.
  const db = useMemo(() => activateUserDb(userId), [userId]);

  useEffect(() => {
    if (!db) return;
    setActiveDb(db); // re-activate after a StrictMode remount
    const held = acquire(db);
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __overload?: unknown }).__overload = { repo, syncNow };
    }
    return () => {
      release(held);
      if (process.env.NODE_ENV !== "production") delete (window as unknown as { __overload?: unknown }).__overload;
    };
  }, [db]);

  useRefreshServerDataOnSync();

  return <>{children}</>;
}
