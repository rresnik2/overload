"use client";
import { useCallback, useSyncExternalStore } from "react";

/** A CSS media query as React state (false on the server and during hydration, then the real answer). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  const snapshot = () => typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
