// When must the server-rendered pages be re-fetched after the sync engine changed data?
//
// `experimental.staleTimes.dynamic` (next.config.ts) lets the client router reuse a visited page for 30 s. The pages below render
// from the database (set history, estimates, favorites, the catalog), and the engine pushes this device's edits to the server a
// moment after they happen, so a cached copy can predate a push or a pull. Pure decisions only; the hook that acts on them is in
// server-refresh-hook.ts. History, templates, settings and the workout screen read Dexie live and need nothing.
//
// A refresh is a whole server render (about 9 queries on /today), so it only happens when the page can be missing something.
// Each server page says which server version it was rendered at (`SyncVersionStamp`, read from SyncState.version BEFORE the
// page's own queries, the same ordering `pullChanges` uses). Every sync reports the server version it caught up to
// (`SyncedInfo.serverVersion`). A page rendered at a version >= that one already shows everything the sync pushed or pulled:
// the usual start-of-app pull on a fresh load, or a push that landed before the page was fetched. Both numbers are the server's
// own counter, so there is no clock skew to reason about. Anything unknown (a page without a stamp, a sync without a version)
// refreshes, as before.
import type { SyncedInfo } from "@/contracts/sync";

const SERVER_DATA_ROOTS = ["/today", "/progress", "/insights", "/exercises"] as const;

/** True for the routes whose content is rendered on the server from synced data. */
export function showsServerData(pathname: string): boolean {
  return SERVER_DATA_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/** Survives provider remounts (the (app) and (workout) groups each mount their own SyncProvider). */
export interface ServerDataState {
  /** A sync changed data while no server-data page was open: the next one that opens must not be served from the cache. */
  stale: boolean;
  /** The server version the latest changing sync caught up to; null/undefined when it did not say. */
  serverVersion?: number | null;
}

export type RefreshDecision = "refresh" | "none";

/** True only when a page rendered at `pageVersion` provably contains everything up to `serverVersion`. */
export function pageIsCurrent(pageVersion: number | null | undefined, serverVersion: number | null | undefined): boolean {
  return pageVersion != null && serverVersion != null && pageVersion >= serverVersion;
}

/**
 * A sync completed. Refresh now when a server-data page is open and may lack what the sync brought; otherwise remember it for
 * the next navigation. `pageVersion` is the open page's render version (null when it has no stamp yet).
 */
export function decideOnSynced(
  state: ServerDataState,
  info: Pick<SyncedInfo, "pushed" | "pulled" | "serverVersion">,
  pathname: string,
  pageVersion: number | null = null,
): RefreshDecision {
  if (info.pushed <= 0 && info.pulled <= 0) return "none";
  state.serverVersion = info.serverVersion ?? null;
  if (!showsServerData(pathname)) {
    state.stale = true;
    return "none";
  }
  state.stale = false;
  return pageIsCurrent(pageVersion, state.serverVersion) ? "none" : "refresh";
}

/** The route changed. Refresh when a server-data page opened after a sync that happened elsewhere and may lack its changes. */
export function decideOnNavigated(state: ServerDataState, pathname: string, pageVersion: number | null = null): RefreshDecision {
  if (!state.stale || !showsServerData(pathname)) return "none";
  state.stale = false;
  return pageIsCurrent(pageVersion, state.serverVersion) ? "none" : "refresh";
}
