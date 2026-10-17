"use client";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import type { ReactNode } from "react";
import { dockTransition, tabNeighbour } from "./nav";
import { announceDirection } from "./nav-direction";
import { SWIPE } from "./swipe-logic";
import { useMediaQuery } from "./useMediaQuery";
import { useSwipe } from "./useSwipe";

/** Phones: the dock is showing. Only touch and pen start a swipe, so no pointer-type test is needed here. */
export const TAB_SWIPE_QUERY = "(max-width: 767px)";

/**
 * `<main>` of the signed-in shell. On phones, a horizontal swipe on one of the three top-level pages (Today, Exercises, Progress)
 * moves to the neighbouring tab: left is the next one and slides forward, right is the previous one and slides back. The ends do
 * not wrap, and nested or More pages ignore the gesture. The direction comes from the same rule as a dock tap.
 */
export function SwipeMain({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const phone = useMediaQuery(TAB_SWIPE_QUERY);
  const onRing = tabNeighbour(pathname, 1) !== null || tabNeighbour(pathname, -1) !== null;

  useSwipe(ref, {
    enabled: phone && onRing,
    // In an installed iPhone app the left edge belongs to the edge-back gesture.
    startFilter: (e) => !(document.documentElement.dataset.edgeBack && e.clientX <= SWIPE.edge),
    onSwipe: (direction) => {
      const href = tabNeighbour(pathname, direction === "left" ? 1 : -1);
      if (!href) return;
      const type = dockTransition(pathname, href);
      announceDirection(type);
      router.push(href, { transitionTypes: [type] });
    },
  });

  return (
    <main id="main" ref={ref} className="shell-main" tabIndex={-1} data-swipe-tabs={phone && onRing ? "" : undefined}>
      {children}
    </main>
  );
}
