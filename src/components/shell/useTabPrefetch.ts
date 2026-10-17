"use client";
// Warm the neighbouring tabs so a swipe or a dock tap does not wait on the server.
//
// How Next 16 treats this (node_modules/next/dist/docs/01-app/02-guides/prefetching.md, checked against the 16.4 source):
//  - A `<Link>` in the viewport prefetches a dynamic route only down to its nearest `loading.js`. `/exercises` has none (a loading
//    boundary above a page that can call notFound() would stream a 200 first, see docs/perf/baseline.md), so its dock link prefetched
//    nothing, and /today and /progress only got their skeleton.
//  - `router.prefetch(href)` does NOT help: in 16.x it is the same "auto" prefetch (the partial one). An earlier version of this file
//    used it and the first tap after a pause was as slow as one without (e2e/perf/prefetch.spec.ts).
//  - `<Link prefetch={true}>` fetches the full route, keeps it for `staleTimes.static` (next.config.ts, 30 s, the same as `dynamic`),
//    so the page can be stale for at most that long; a sync still refreshes it (server-refresh.ts). Changing the prop from the default
//    to `true` re-mounts the link's prefetch with the full strategy.
//  - Prefetching only runs in production.
// It costs the server one render per neighbour, so the dock turns `prefetch` on only once the page has been idle for a moment, skips
// data-saver and slow connections, and skips an active workout (the lifter is logging, not browsing). Nothing happens on desktop: the
// dock is hidden there, and a hidden link is never in the viewport.
import { useEffect, useState } from "react";
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

/**
 * False on every route change, true once the page has been idle and prefetching is polite. The dock gives its neighbour links
 * `prefetch={true}` while this is true.
 */
export function useTabPrefetchReady(enabled: boolean, pathname: string): boolean {
  // The path the page was idle on: switching route makes it stale, so "ready" starts over without resetting state in the effect.
  const [idlePath, setIdlePath] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || neighbourTabs(pathname).length === 0) return;
    const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
    let cancelled = false;
    const run = () => {
      if (cancelled || document.visibilityState === "hidden" || !mayPrefetchTabs(connection, isWorkoutActive())) return;
      setIdlePath(pathname);
    };
    // After the page has painted and settled: idle time, with a timeout so a busy main thread cannot starve it forever.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 4_000 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
        setIdlePath(null); // leaving the route (or changing the inputs) starts the wait over
      };
    }
    const timer = window.setTimeout(run, 1_500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setIdlePath(null);
    };
  }, [enabled, pathname]);
  return enabled && idlePath === pathname;
}
