"use client";
// `useFavoriteIds`: the user's starred exercise ids from ONE shared Dexie live query, however many stars are on screen
// (a library page mounts 48, the picker 60+). The query starts with the first subscriber and stops with the last.
import { liveQuery, type Subscription } from "dexie";
import { useCallback, useSyncExternalStore } from "react";
import { activeDbName, subscribeActiveDb } from "@/client/db/active";
import { repo } from "./index";

interface Shared {
  dbName: string;
  ids: ReadonlySet<string> | undefined;
  listeners: Set<() => void>;
  subscription: Subscription | null;
}

let shared: Shared | null = null;

function subscribe(dbName: string, listener: () => void): () => void {
  if (!shared || shared.dbName !== dbName) {
    shared?.subscription?.unsubscribe();
    const next: Shared = { dbName, ids: undefined, listeners: new Set(), subscription: null };
    next.subscription = liveQuery(() => repo.favorites.ids()).subscribe({
      next(ids) {
        next.ids = ids;
        for (const l of next.listeners) l();
      },
      error() {},
    });
    shared = next;
  }
  const current = shared;
  current.listeners.add(listener);
  return () => {
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.subscription?.unsubscribe();
      if (shared === current) shared = null;
    }
  };
}

/** undefined until the local database answers (and during SSR, or while no database is active). */
export function useFavoriteIds(): ReadonlySet<string> | undefined {
  const dbName = useSyncExternalStore(subscribeActiveDb, activeDbName, () => null);
  // A stable `subscribe` per database: a new function every render would unsubscribe and resubscribe on each render.
  const subscribeToDb = useCallback((listener: () => void) => (dbName ? subscribe(dbName, listener) : () => undefined), [dbName]);
  return useSyncExternalStore(
    subscribeToDb,
    () => (shared && shared.dbName === dbName ? shared.ids : undefined),
    () => undefined,
  );
}
