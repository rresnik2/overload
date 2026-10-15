// The device's hybrid logical clock, persisted in the `meta` table. Every call must run inside a Dexie transaction that
// includes `meta` (all repo writes and engine applies do), so a tick and the row write it stamps are atomic.
import { createHlcClock } from "@/lib/sync/hlc";
import type { Hlc } from "@/contracts/sync";
import { META_KEYS, getMeta, setMeta, type OverloadDb } from "./schema";
import { dx } from "./zone";

function randomId(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** The stable per-install id (HLC nodeId and request deviceId). Created on first use. */
export const ensureDeviceId = dx(async function ensureDeviceId(db: OverloadDb): Promise<string> {
  const existing = await getMeta<string>(db, META_KEYS.deviceId);
  if (existing) return existing;
  const id = randomId(12);
  await setMeta(db, META_KEYS.deviceId, id);
  return id;
});

const loadClock = dx(async function loadClock(db: OverloadDb) {
  // Sequential awaits on purpose: a native Promise.all inside a Dexie transaction loses the ambient transaction.
  const deviceId = await ensureDeviceId(db);
  const last = await getMeta<string>(db, META_KEYS.hlc);
  return createHlcClock({ nodeId: deviceId, initial: last ?? null });
});

/** A new HLC for a local write (persisted). */
export const tickHlc = dx(async function tickHlc(db: OverloadDb): Promise<Hlc> {
  const clock = await loadClock(db);
  const hlc = clock.tick();
  await setMeta(db, META_KEYS.hlc, hlc);
  return hlc;
});

/** Fold the server's HLC into the device clock (persisted). */
export const receiveHlc = dx(async function receiveHlc(db: OverloadDb, remote: Hlc): Promise<void> {
  const clock = await loadClock(db);
  await setMeta(db, META_KEYS.hlc, clock.receive(remote));
});

/** The HLC to send as `clientHlc` (does not advance the clock). */
export const currentHlc = dx(async function currentHlc(db: OverloadDb): Promise<Hlc> {
  return (await loadClock(db)).now();
});
