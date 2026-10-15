"use client";
// True inside an iPhone/iPad home-screen app (separate cookie storage; Google redirect flows are awkward there).
import { useSyncExternalStore } from "react";

function detect(): boolean {
  if (typeof window === "undefined") return false;
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return standalone && ios;
}

const subscribe = () => () => {};

export function useStandaloneIos(): boolean {
  return useSyncExternalStore(subscribe, detect, () => false);
}
