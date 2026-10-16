// PWA coordination flag between the workout screen (stream E2) and the service-worker update flow (stream B). PURE.
// While a workout is in progress E2 calls setWorkoutActive(true); B's shell only posts SKIP_WAITING to a waiting
// service worker when isWorkoutActive() is false ("a service-worker update never activates in the middle of a workout").
// The sync engine reads the same flag for its workout policy (src/client/sync/engine.ts): while it is set, writes do not
// trigger a sync and the other triggers are throttled to once every 5 minutes. Turning it off (finish or discard) syncs at once,
// which is why changes to it are broadcast: `onWorkoutActiveChange` fires in this tab (custom event) and in other tabs (storage).
export const ACTIVE_WORKOUT_STORAGE_KEY = "overload-active-workout";
const CHANGE_EVENT = "overload:workout-active";

export function setWorkoutActive(active: boolean): void {
  const was = isWorkoutActive();
  try {
    if (active) localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, String(Date.now()));
    else localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  // Refreshing the timestamp of an already-active workout (every 10 minutes) is not a change.
  if (was !== active && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: active }));
}

/** True while a workout is active. A flag older than `maxAgeMs` (default 12 h) is treated as stale (crashed tab). */
export function isWorkoutActive(maxAgeMs = 12 * 60 * 60 * 1000): boolean {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    if (!raw) return false;
    const since = Number(raw);
    return Number.isFinite(since) && Date.now() - since < maxAgeMs;
  } catch {
    return false;
  }
}

/** Calls `listener(active)` when the flag flips in this tab or another one. Returns the unsubscribe function. */
export function onWorkoutActiveChange(listener: (active: boolean) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  let last = isWorkoutActive();
  const onLocal = (event: Event) => {
    last = Boolean((event as CustomEvent<boolean>).detail);
    listener(last);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== ACTIVE_WORKOUT_STORAGE_KEY) return;
    const now = isWorkoutActive();
    if (now === last) return;
    last = now;
    listener(now);
  };
  window.addEventListener(CHANGE_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}
