// Which page tips the lifter has dismissed or already had a session with, kept in localStorage (a per-device convenience, never
// required: every read and write is wrapped in try/catch and the tips simply show when storage is unavailable).
import { useSyncExternalStore } from "react";

const PREFIX = "overload:tip:";
const SEEN = "overload:tip-seen:";
const HIDE_ALL = "overload:tips-off";
/**
 * A tip belongs to the first session it is seen in: it shows on every visit, reloads included, for this long after it first
 * appeared, then it is gone. Marking it on first sight alone hid it on the very next load (a service-worker update reloads).
 */
export const TIP_SESSION_MS = 30 * 60_000;
/** Tips on screen in this page load: one never vanishes while it is being read. */
const shownThisLoad = new Set<string>();
const EVENT = "overload:tips-changed";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function write(key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    // storage unavailable (private window, blocked): tips just keep showing
  }
  window.dispatchEvent(new Event(EVENT));
}

/** When the tip first appeared on this device (ms since epoch), or null. */
function seenAt(id: string): number | null {
  try {
    const n = Number(window.localStorage.getItem(SEEN + id) ?? NaN);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function pastFirstSession(id: string): boolean {
  if (shownThisLoad.has(id)) return false;
  const at = seenAt(id);
  return at !== null && Date.now() - at > TIP_SESSION_MS;
}

/**
 * Is the tip with this id hidden: dismissed, all tips turned off, or its first session is over (first seen more than
 * TIP_SESSION_MS ago)? Shows on the server and first render.
 */
export function useTipHidden(id: string): boolean {
  return useSyncExternalStore(subscribe, () => read(HIDE_ALL) || read(PREFIX + id) || pastFirstSession(id), () => false);
}

/**
 * The tip is on screen: remember when it first appeared, and keep it for the rest of this page load. Not for a tip whose first
 * session is over: the hydration render shows every tip (the server cannot read storage), and it must still go.
 */
export function markTipSeen(id: string) {
  const at = seenAt(id);
  if (at !== null && Date.now() - at > TIP_SESSION_MS) return;
  shownThisLoad.add(id);
  if (at !== null) return;
  try {
    window.localStorage.setItem(SEEN + id, String(Date.now()));
  } catch {
    // storage unavailable: the tip just keeps showing
  }
}

export function dismissTip(id: string) {
  write(PREFIX + id, true);
}

export function useTipsEnabled(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => !read(HIDE_ALL),
    () => true,
  );
}

/** Settings → "Show tips": on clears every dismissal so each tip comes back; off hides them all. */
export function setTipsEnabled(enabled: boolean) {
  if (enabled) {
    try {
      for (const key of Object.keys(window.localStorage)) if (key.startsWith(PREFIX) || key.startsWith(SEEN)) window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
  write(HIDE_ALL, !enabled);
}
