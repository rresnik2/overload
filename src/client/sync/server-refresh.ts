// When must the server-rendered pages be re-fetched after the sync engine changed data?
//
// `experimental.staleTimes.dynamic` (next.config.ts) lets the client router reuse a visited page for 30 s. The pages below render
// from the database (set history, estimates, favorites, the catalog), and the engine pushes this device's edits to the server a
// moment after they happen, so a cached copy can predate a push or a pull. Pure decisions only; the hook that acts on them is in
// server-refresh-hook.ts. History, templates, settings and the workout screen read Dexie live and need nothing.
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
}

export type RefreshDecision = "refresh" | "none";

/** A sync completed. Refresh now when a server-data page is open; otherwise remember it for the next navigation. */
export function decideOnSynced(state: ServerDataState, info: Pick<SyncedInfo, "pushed" | "pulled">, pathname: string): RefreshDecision {
  if (info.pushed <= 0 && info.pulled <= 0) return "none";
  if (showsServerData(pathname)) {
    state.stale = false;
    return "refresh";
  }
  state.stale = true;
  return "none";
}

/** The route changed. Refresh when a server-data page opened after a sync that happened elsewhere. */
export function decideOnNavigated(state: ServerDataState, pathname: string): RefreshDecision {
  if (!state.stale || !showsServerData(pathname)) return "none";
  state.stale = false;
  return "refresh";
}
