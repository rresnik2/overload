"use client";
// Warm the neighbouring tabs so a swipe or a dock tap does not wait on the server.
//
// How Next 16 treats this (node_modules/next/dist/docs/01-app/02-guides/prefetching.md):
//  - A `<Link>` in the viewport only prefetches a dynamic route down to its nearest `loading.js`. `/exercises` has none (a loading
//    boundary above a page that can call notFound() would stream a 200 first, see docs/perf/baseline.md), so its dock link prefetched
//    nothing, and /today and /progress only got their skeleton.
//  - `router.prefetch(href)` fetches the full route, like `prefetch={true}`, and keeps it for `staleTimes.static` (next.config.ts,
//    30 s, the same as `dynamic`), so the page can show stale data for at most that long; a sync still refreshes it (server-refresh.ts).
//  - Prefetching only runs in production; in development the call is a no-op.
// It costs the server one render per neighbour, so it waits for idle time, skips data-saver and slow connections, and skips an
// active workout (the lifter is logging, not browsing).
import { useEffect } from "react";
import { isWorkoutActive } from "@/lib/pwa";
import { tabNeighbour } from "./nav";

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when it is polite to spend the user's data and our server on a speculative prefetch. */
export function mayPrefetchTabs(connection: NetworkInformationLike | undefined, workoutActive: boolean): boolean {
  if (workoutActive) return false;
  if (connection?.saveData) return false;
  if (connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return false;
  return true;
}

/** The tabs next to `pathname` in swipe order, the one a left swipe reaches first. */
export function neighbourTabs(pathname: string): string[] {
  return [tabNeighbour(pathname, 1), tabNeighbour(pathname, -1)].filter((href): href is string => href !== null);
}

export function useTabPrefetch(enabled: boolean, pathname: string, prefetch: (href: string) => void): void {
  useEffect(() => {
    if (!enabled) return;
    const targets = neighbourTabs(pathname);
    if (targets.length === 0) return;
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    let cancelled = false;
    const run = () => {
      if (cancelled || document.visibilityState === "hidden" || !mayPrefetchTabs(connection, isWorkoutActive())) return;
      for (const href of targets) prefetch(href);
    };
    // After the page has painted and settled: idle time, with a timeout so a busy main thread cannot starve it forever.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(run, 1_500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // `prefetch` is router.prefetch: stable, and only a route change should re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathname]);
}
