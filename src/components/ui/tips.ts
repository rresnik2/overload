// Which page tips the lifter has dismissed, kept in localStorage (a per-device convenience, never required: every read
// and write is wrapped in try/catch and the tips simply show when storage is unavailable).
import { useSyncExternalStore } from "react";

const PREFIX = "overload:tip:";
const SEEN = "overload:tip-seen:";
const HIDE_ALL = "overload:tips-off";
/** Tips first shown in this page load: they stay for the rest of it, then a later visit finds them seen and hides them. */
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

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Is the tip with this id hidden: dismissed, all tips turned off, or already seen on an earlier visit (a tip shows on the first
 * visit only)? Shows on the server and first render.
 */
export function useTipHidden(id: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(HIDE_ALL) || read(PREFIX + id) || (read(SEEN + id) && !shownThisLoad.has(id)),
    () => false,
  );
}

/** The tip was on screen: it stays for the rest of this page load and is not shown on later visits. */
export function markTipSeen(id: string) {
  if (shownThisLoad.has(id) || read(SEEN + id)) return;
  shownThisLoad.add(id);
  write(SEEN + id, true);
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
