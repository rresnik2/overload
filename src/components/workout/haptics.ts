// Tiny haptics helper for the dial and the set buttons. Android browsers get the Vibration API; iOS Safari gets the
// <input type="checkbox" switch> trick (toggling the switch through its label produces a system tick); everything else is
// a silent no-op. Nothing here ever throws. Whether haptics are on is a per-device flag in localStorage, kept like
// src/components/ui/tips.ts (every read and write in try/catch).
import { useSyncExternalStore } from "react";

const OFF_KEY = "overload:haptics-off";
const EVENT = "overload:haptics-changed";
/** At most one tick per this many milliseconds. */
export const THROTTLE_MS = 35;
/** Gap between the two taps of the iOS confirm pulse. */
const IOS_GAP_MS = 70;

// ───────────────────────────── the on/off flag ─────────────────────────────

function readOff(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** Is the per-device haptics flag on (the default)? */
export function isHapticsEnabled(): boolean {
  return !readOff();
}

export function setHapticsEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.removeItem(OFF_KEY);
    else window.localStorage.setItem(OFF_KEY, "1");
  } catch {
    // storage unavailable (private window, blocked): the flag simply cannot be turned off
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // no window (server): nothing to notify
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

/** Settings -> Haptics. Reads on (the default) on the server and the first render. */
export function useHapticsEnabled(): boolean {
  return useSyncExternalStore(subscribe, isHapticsEnabled, () => true);
}

// ───────────────────────────── firing ─────────────────────────────

let lastTick = Number.NEGATIVE_INFINITY;
let switchLabel: HTMLLabelElement | null = null;

type Mode = "vibrate" | "ios" | "none";

function mode(): Mode {
  if (typeof navigator === "undefined") return "none";
  if (typeof navigator.vibrate === "function") return "vibrate";
  if (typeof document === "undefined") return "none";
  const ua = navigator.userAgent ?? "";
  // iPadOS reports a Mac user agent but has touch points.
  const ios = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  return ios ? "ios" : "none";
}

/** One hidden switch for the whole page, created on first use. */
function iosTap(): void {
  if (!switchLabel || !switchLabel.isConnected) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    switchLabel = label;
  }
  switchLabel.click();
}

function fire(pattern: number | number[], kind: "tick" | "confirm"): void {
  try {
    if (!isHapticsEnabled()) return;
    const m = mode();
    if (m === "none") return;
    const now = Date.now();
    if (kind === "tick" && now - lastTick < THROTTLE_MS) return;
    lastTick = now;
    if (m === "vibrate") {
      navigator.vibrate(pattern);
    } else {
      iosTap();
      if (kind === "confirm") setTimeout(() => {
        try {
          iosTap();
        } catch {
          // ignore
        }
      }, IOS_GAP_MS);
    }
  } catch {
    // haptics are a nicety: never break the UI
  }
}

/** A light tick: dial detents, effort and Log set taps. Throttled to one per 35 ms. */
export function tick(): void {
  fire(6, "tick");
}

/** A firmer double pulse for a logged set. Not throttled, but it resets the tick window. */
export function confirm(): void {
  fire([12, 60, 12], "confirm");
}

/** For tests: forget the throttle window and the hidden switch. */
export function resetHapticsForTests(): void {
  lastTick = Number.NEGATIVE_INFINITY;
  switchLabel = null;
}
