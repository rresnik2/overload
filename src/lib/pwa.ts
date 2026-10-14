// PWA coordination flag between the workout screen (stream E2) and the service-worker update flow (stream B). PURE.
// While a workout is in progress E2 calls setWorkoutActive(true); B's shell only posts SKIP_WAITING to a waiting
// service worker when isWorkoutActive() is false ("a service-worker update never activates in the middle of a workout").
export const ACTIVE_WORKOUT_STORAGE_KEY = "overload-active-workout";

export function setWorkoutActive(active: boolean): void {
  try {
    if (active) localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, String(Date.now()));
    else localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
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
