"use client";
// Applies the decisions in server-refresh.ts: router.refresh() re-fetches the open page and drops the router cache.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { decideOnNavigated, decideOnSynced, pageIsCurrent, showsServerData, type ServerDataState } from "./server-refresh";
import { useOnSynced } from "./hooks";
import { currentPageVersion } from "./page-version";

const REFRESH_DELAY_MS = 400;
const sharedState: ServerDataState = { stale: false, serverVersion: null };

export function useRefreshServerDataOnSync(): void {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshSoon = () => {
    if (timer.current) return; // coalesce a burst of syncs into one refresh
    timer.current = setTimeout(() => {
      timer.current = null;
      // The user may have moved on during the delay: a page that shows no server data is not refreshed, the next one that does is.
      if (!showsServerData(window.location.pathname)) {
        sharedState.stale = true;
        return;
      }
      // ...or onto a page that was fetched after the change and already has it.
      if (pageIsCurrent(currentPageVersion(), sharedState.serverVersion)) return;
      router.refresh();
    }, REFRESH_DELAY_MS);
  };

  useOnSynced((info) => {
    if (decideOnSynced(sharedState, info, window.location.pathname, currentPageVersion()) === "refresh") refreshSoon();
  });

  useEffect(() => {
    if (decideOnNavigated(sharedState, pathname, currentPageVersion()) === "refresh") router.refresh();
    // router is stable; only a route change should re-run this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
}
