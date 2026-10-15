"use client";
// `useLive`: re-runs a Dexie query whenever the tables it reads change (wraps dexie-react-hooks' useLiveQuery).
// Returns undefined until the first result (and while no database is active, e.g. during SSR).
import { useLiveQuery } from "dexie-react-hooks";
import { useSyncExternalStore } from "react";
import { activeDbName, subscribeActiveDb } from "@/client/db/active";
import type { UseLive } from "@/contracts/repo";

export const useLive: UseLive = <T,>(query: () => Promise<T> | T, deps: readonly unknown[] = []) => {
  const dbName = useSyncExternalStore(subscribeActiveDb, activeDbName, () => null);
  return useLiveQuery(() => (dbName ? query() : undefined), [dbName, ...deps]) as T | undefined;
};
