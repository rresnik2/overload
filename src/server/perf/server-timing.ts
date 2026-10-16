// Measurement only (stream DIAL, PERF-0): per-request Prisma query count and database time, behind OVERLOAD_SERVER_TIMING=1.
// With the flag off nothing here runs: db.ts does not subscribe to query events, the proxy adds no header and the root layout
// renders no probe.
//
// A page response cannot carry a Server-Timing header with the final numbers (headers leave before streaming finishes), so each
// request records one entry when it completes (`after()`), the server logs one line, and /api/perf/server-timing serves the
// recent entries as JSON and as a Server-Timing header for the harness.
//
// Request scoping: proxy.ts stamps every request with a unique x-overload-id header. The Prisma client extension (db.ts) reads it
// with `headers()` in the caller's async context (Next's request store survives awaits there; Prisma's `$on("query")` listener
// fires outside it and React `cache()` does not survive awaits, so both recorded nothing) and accumulates into a Map keyed by that
// id. The root-layout probe takes the same entry when the response has finished.

export const SERVER_TIMING_FLAG = "OVERLOAD_SERVER_TIMING";
export const serverTimingEnabled = (): boolean => process.env[SERVER_TIMING_FLAG] === "1";

export interface RequestStats {
  queries: number;
  /** Sum of every query's duration. Concurrent queries overlap, so this can exceed the wall time. */
  dbMs: number;
  /** Earliest query start and latest query end (epoch ms): their difference is the wall time the database was busy. */
  firstStart: number;
  lastEnd: number;
}

export interface TimingEntry {
  path: string;
  kind: "html" | "rsc";
  /** Epoch ms when the request completed on the server. */
  at: number;
  queries: number;
  dbMs: number;
  dbWallMs: number;
  /** Proxy to end of response (render plus streaming) as seen by the server. */
  totalMs: number;
}

const fresh = (): RequestStats => ({ queries: 0, dbMs: 0, firstStart: Infinity, lastEnd: 0 });

const gs = globalThis as unknown as { __overloadReqStats?: Map<string, RequestStats> };
const statsMap = (): Map<string, RequestStats> => (gs.__overloadReqStats ??= new Map());
const MAX_LIVE = 200;

/** The stats object for one request id (created on first use). Removed by `takeStats` when the request finishes. */
export function requestStats(id: string): RequestStats {
  const m = statsMap();
  let s = m.get(id);
  if (!s) {
    if (m.size >= MAX_LIVE) m.delete(m.keys().next().value as string);
    s = fresh();
    m.set(id, s);
  }
  return s;
}

export function takeStats(id: string): RequestStats {
  const s = requestStats(id);
  statsMap().delete(id);
  return s;
}

async function currentRequestId(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    return (await headers()).get("x-overload-id");
  } catch {
    return null; // outside a request (scripts, tests, cache scopes): not counted
  }
}

export function recordQuery(stats: RequestStats, durationMs: number, endedAtMs: number): void {
  stats.queries += 1;
  stats.dbMs += durationMs;
  stats.firstStart = Math.min(stats.firstStart, endedAtMs - durationMs);
  stats.lastEnd = Math.max(stats.lastEnd, endedAtMs);
}

/**
 * Wraps one Prisma operation (the client extension in db.ts). The request is identified BEFORE the query runs, in the caller's
 * async context.
 */
export async function measureQuery<T>(run: () => Promise<T>, stats?: RequestStats): Promise<T> {
  const id = stats ? null : await currentRequestId();
  const target = stats ?? (id ? requestStats(id) : null);
  const start = Date.now();
  try {
    return await run();
  } finally {
    const end = Date.now();
    if (target) recordQuery(target, end - start, end);
  }
}

const MAX_ENTRIES = 500;
const g = globalThis as unknown as { __overloadTimings?: TimingEntry[] };
const entries = (): TimingEntry[] => (g.__overloadTimings ??= []);

const round = (n: number): number => Math.round(n * 10) / 10;

/** `db;dur=12.3;desc="9 queries", dbwall;dur=8.1, app;dur=40.2` */
export function serverTimingHeader(e: TimingEntry): string {
  return `db;dur=${e.dbMs};desc="${e.queries} queries", dbwall;dur=${e.dbWallMs}, app;dur=${e.totalMs}`;
}

export function finishRequest(path: string, kind: TimingEntry["kind"], startedAt: number, stats: RequestStats): TimingEntry {
  const now = Date.now();
  const entry: TimingEntry = {
    path,
    kind,
    at: now,
    queries: stats.queries,
    dbMs: round(stats.dbMs),
    dbWallMs: stats.queries ? round(stats.lastEnd - stats.firstStart) : 0,
    totalMs: round(now - startedAt),
  };
  const all = entries();
  all.push(entry);
  if (all.length > MAX_ENTRIES) all.splice(0, all.length - MAX_ENTRIES);
  console.info(`[server-timing] ${kind} ${path} ${serverTimingHeader(entry)}`);
  return entry;
}

export const recentTimings = (): TimingEntry[] => [...entries()];
export const resetTimings = (): void => {
  entries().length = 0;
};
