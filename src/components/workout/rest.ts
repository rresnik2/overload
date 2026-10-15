// Rest timer maths (pure). The timer never counts ticks: it stores an ABSOLUTE `endsAt` (epoch ms), so a backgrounded
// iOS tab (timers paused) or a reload still shows the right remaining time. Paused timers store the remaining ms instead.
export interface RestState {
  workoutId: string;
  /** Epoch ms when the rest ends; null while paused. */
  endsAt: number | null;
  /** The length the rest started with (for the "Rest 1:30" caption). */
  durationSec: number;
  /** Remaining ms while paused; null while running. */
  pausedRemainingMs: number | null;
}

export type RestStatus = "idle" | "running" | "paused" | "done";

export const REST_STORAGE_KEY = "overload-rest";
export const REST_MAX_SEC = 3600;

export function startRest(workoutId: string, nowMs: number, seconds: number): RestState {
  const sec = Math.min(REST_MAX_SEC, Math.max(1, Math.round(seconds)));
  return { workoutId, endsAt: nowMs + sec * 1000, durationSec: sec, pausedRemainingMs: null };
}

export function restRemainingMs(state: RestState | null, nowMs: number): number {
  if (!state) return 0;
  if (state.endsAt === null) return Math.max(0, state.pausedRemainingMs ?? 0);
  return Math.max(0, state.endsAt - nowMs);
}

export function restStatus(state: RestState | null, nowMs: number): RestStatus {
  if (!state) return "idle";
  if (state.endsAt === null) return "paused";
  return state.endsAt <= nowMs ? "done" : "running";
}

export function pauseRest(state: RestState, nowMs: number): RestState {
  if (state.endsAt === null) return state;
  return { ...state, endsAt: null, pausedRemainingMs: Math.max(0, state.endsAt - nowMs) };
}

export function resumeRest(state: RestState, nowMs: number): RestState {
  if (state.endsAt !== null) return state;
  return { ...state, endsAt: nowMs + (state.pausedRemainingMs ?? 0), pausedRemainingMs: null };
}

/** +/- seconds on a running or paused timer (never below zero, never above REST_MAX_SEC from now). */
export function adjustRest(state: RestState, nowMs: number, deltaSec: number): RestState {
  const remaining = Math.max(0, restRemainingMs(state, nowMs) + deltaSec * 1000);
  const capped = Math.min(remaining, REST_MAX_SEC * 1000);
  const durationSec = Math.max(state.durationSec, Math.ceil(capped / 1000));
  return state.endsAt === null ? { ...state, pausedRemainingMs: capped, durationSec } : { ...state, endsAt: nowMs + capped, durationSec };
}

/** Wall-clock safe parse of what saveRest wrote; anything malformed is treated as "no timer". */
export function parseRest(raw: string | null, workoutId: string): RestState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RestState> | null;
    if (!value || value.workoutId !== workoutId || typeof value.durationSec !== "number") return null;
    const endsAt = typeof value.endsAt === "number" ? value.endsAt : null;
    const paused = typeof value.pausedRemainingMs === "number" ? value.pausedRemainingMs : null;
    if (endsAt === null && paused === null) return null;
    return { workoutId, endsAt, durationSec: value.durationSec, pausedRemainingMs: endsAt === null ? paused : null };
  } catch {
    return null;
  }
}

export function loadRest(workoutId: string, storage: Pick<Storage, "getItem"> | null = safeStorage()): RestState | null {
  try {
    return parseRest(storage?.getItem(REST_STORAGE_KEY) ?? null, workoutId);
  } catch {
    return null;
  }
}

export function saveRest(state: RestState | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (!storage) return;
    if (state) storage.setItem(REST_STORAGE_KEY, JSON.stringify(state));
    else storage.removeItem(REST_STORAGE_KEY);
  } catch {
    /* storage unavailable: the timer still works for this page view */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
