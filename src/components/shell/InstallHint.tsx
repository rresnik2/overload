"use client";
import { Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const DISMISS_KEY = "overload-install-hint-dismissed";

// "Add to Home Screen" only exists in iOS Safari (Chrome/Firefox on iOS cannot install). Hidden once installed.
function shouldShow(): boolean {
  try {
    if (localStorage.getItem(DISMISS_KEY)) return false;
  } catch {
    /* storage unavailable: still show once per page load */
  }
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iOS && safari && !standalone;
}
const subscribe = () => () => {};

/** One-time, dismissible, remembered hint for iPhone Safari users: Share -> Add to Home Screen. */
export function InstallHint() {
  const eligible = useSyncExternalStore(subscribe, shouldShow, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!eligible || dismissed) return null;
  return (
    <aside className="install-hint" aria-label="Install Overload">
      <Share size={20} aria-hidden="true" className="install-hint__icon" />
      <p className="install-hint__text">
        Install Overload: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong> to log workouts offline.
      </p>
      <button
        type="button"
        className="install-hint__close"
        aria-label="Dismiss install hint"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
