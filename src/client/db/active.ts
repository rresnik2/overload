// The per-user databases and which one is ACTIVE (the one `repo` and `useLive` talk to).
// SyncProvider activates the signed-in user's database; signing in as someone else on the same browser opens a
// different IndexedDB database (`overload-<userId>`), so nothing leaks between users.
import { OverloadDb } from "./schema";

const open = new Map<string, OverloadDb>();
let active: OverloadDb | null = null;
const listeners = new Set<() => void>();

export function openUserDb(userId: string): OverloadDb {
  let db = open.get(userId);
  if (!db) {
    db = new OverloadDb(userId);
    open.set(userId, db);
  }
  return db;
}

export function getActiveDb(): OverloadDb | null {
  return active;
}

export function requireActiveDb(): OverloadDb {
  if (!active) throw new Error("repo: no active database (mount <SyncProvider userId> first)");
  return active;
}

export function setActiveDb(db: OverloadDb | null): void {
  if (active === db) return;
  active = db;
  for (const l of listeners) l();
}

/** Open (cached) and activate the user's database. Safe to call during render; a no-op where IndexedDB does not exist (SSR). */
export function activateUserDb(userId: string): OverloadDb | null {
  if (typeof indexedDB === "undefined") return null;
  const db = openUserDb(userId);
  setActiveDb(db);
  return db;
}

export function subscribeActiveDb(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function activeDbName(): string | null {
  return active?.name ?? null;
}

/** Close and forget a user's database handle (tests, sign-out). Does not delete the data. */
export function closeUserDb(userId: string): void {
  const db = open.get(userId);
  if (!db) return;
  if (active === db) setActiveDb(null);
  db.close();
  open.delete(userId);
}

/** Close every handle and delete every database this module opened (tests). */
export async function resetAllDbs(): Promise<void> {
  const names = [...open.values()].map((db) => db.name);
  setActiveDb(null);
  for (const db of open.values()) db.close();
  open.clear();
  const { default: Dexie } = await import("dexie");
  await Promise.all(names.map((n) => Dexie.delete(n)));
}
