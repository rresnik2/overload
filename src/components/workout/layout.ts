"use client";
import { useSyncExternalStore } from "react";

/**
 * Phones and tablets get the dial; a desktop with a mouse types (decision D3). The choice is made on width as well as on
 * `(pointer: coarse)`, so an iPad in landscape still gets the dial. Spec section 04.
 */
export const DIAL_LAYOUT_QUERY = "(max-width: 1023px), (pointer: coarse)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(DIAL_LAYOUT_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const snapshot = (): boolean => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DIAL_LAYOUT_QUERY).matches;

/** True on phones and tablets (the active-set panel with the dial), false on a desktop with a fine pointer (typing). */
export function useDialLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
