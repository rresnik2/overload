"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { SWIPE } from "./swipe-logic";
import { useSwipe } from "./useSwipe";

/**
 * True in an installed iPhone or iPad app (a home-screen PWA): `display-mode: standalone` on iOS. That mode has no browser chrome and
 * no system back swipe. Android Chrome (standalone or not) and iOS Safari already have a system back gesture, so they return false.
 */
export function isIosStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = nav.standalone === true || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);
  return ios && standalone;
}

/** Is there an in-app entry behind this one? The Navigation API knows; otherwise a history longer than one entry is the best guess. */
function canGoBack(): boolean {
  const nav = (window as Window & { navigation?: { canGoBack?: boolean } }).navigation;
  if (typeof nav?.canGoBack === "boolean") return nav.canGoBack;
  return window.history.length > 1;
}

const subscribeNever = () => () => undefined;

const ROOT_VARS = { dx: "--edge-dx" } as const;

/**
 * Edge swipe back for the installed iPhone app: a touch that lands within 20 px of the left edge and drags right moves the page with
 * the finger (the peek); letting go past 64 px, or with a fling, goes back one history entry, and anything shorter snaps back. The
 * back goes through history, so the page slides as `nav-back` (see PageTransition). Nothing happens when there is no earlier entry.
 * Renders nothing; the peek is `html[data-edge-peek] #main` in motion.css.
 */
export function EdgeSwipeBack() {
  const router = useRouter();
  const rootRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.documentElement);
  const enabled = useSyncExternalStore(subscribeNever, isIosStandalone, () => false);
  const settleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.dataset.edgeBack = "";
    return () => {
      delete root.dataset.edgeBack;
    };
  }, [enabled]);

  const clearPeek = () => {
    const root = document.documentElement;
    window.clearTimeout(settleTimer.current);
    delete root.dataset.edgePeek;
    root.style.removeProperty(ROOT_VARS.dx);
  };

  useSwipe(rootRef, {
    enabled,
    directions: ["right"],
    startFilter: (e) => e.clientX <= SWIPE.edge && canGoBack(),
    onMove: (dx) => {
      const root = document.documentElement;
      window.clearTimeout(settleTimer.current);
      root.dataset.edgePeek = "drag";
      root.style.setProperty(ROOT_VARS.dx, `${Math.max(0, dx)}px`);
    },
    onEnd: (direction) => {
      if (direction) {
        clearPeek();
        router.back();
        return;
      }
      // Too short: ease back to rest (instantly under reduced motion, via the 0.01 ms transition), then drop the peek.
      const root = document.documentElement;
      root.dataset.edgePeek = "settle";
      root.style.setProperty(ROOT_VARS.dx, "0px");
      settleTimer.current = window.setTimeout(clearPeek, 220);
    },
  });

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  return null;
}
