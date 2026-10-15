// The sync engine: push the outbox, apply the response, page through the pull, refresh the catalog.
//
// iOS home-screen PWAs have no Background Sync, so the triggers do its job: app start, `online`, `visibilitychange`,
// 1.5 s after a write, every 30 s while changes are pending, and manual `syncNow`. `navigator.locks` keeps it to one
// sync at a time across tabs. A signed-out (401) device keeps its pending changes and reports state `signed-out`.
import { liveQuery } from "dexie";
import type { CatalogResponse } from "@/contracts/catalog";
import { catalogEtag } from "@/contracts/catalog";
import type { SyncReason, SyncRequest, SyncResponse, SyncResult } from "@/contracts/sync";
import type { PersonalRecordRow } from "@/contracts/entities";
import { currentHlc, ensureDeviceId } from "@/client/db/clock";
import { META_KEYS, getMeta, setMeta, type OverloadDb } from "@/client/db/schema";
import { createRepo } from "@/client/repo/repo";
import { applyResponse } from "./apply";
import { readBatch } from "./outbox";
import { statusStore, syncedListeners, type StatusStore, type SyncedListeners } from "./status";

export const WRITE_DELAY_MS = 1_500;
export const PENDING_INTERVAL_MS = 30_000;
const CATALOG_RECHECK_MS = 6 * 60 * 60 * 1000;
const MAX_ROUNDS = 100;
const REQUEST_TIMEOUT_MS = 20_000;

export interface EngineOptions {
  db: OverloadDb;
  fetch?: typeof fetch;
  status?: StatusStore;
  listeners?: SyncedListeners;
  /** Test seam; defaults to navigator.locks when available, else an in-process flag. */
  locks?: Pick<LockManager, "request">;
  writeDelayMs?: number;
  intervalMs?: number;
  now?: () => number;
}

export interface Engine {
  readonly db: OverloadDb;
  syncNow(reason?: SyncReason): Promise<SyncResult>;
  start(): void;
  stop(): void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

export function createEngine(options: EngineOptions): Engine {
  const { db } = options;
  const fetchImpl = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const status = options.status ?? statusStore;
  const listeners = options.listeners ?? syncedListeners;
  const now = options.now ?? Date.now;
  const repo = createRepo(() => db);
  let inProcessBusy = false;
  let lastCatalogCheck = 0;
  let stopFns: (() => void)[] = [];
  let previousPending = 0;

  async function postSync(request: SyncRequest): Promise<SyncResponse> {
    const res = await fetchImpl("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(request),
      signal: typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
    });
    if (!res.ok) throw new HttpError(res.status, `Sync failed (${res.status})`);
    return (await res.json()) as SyncResponse;
  }

  async function refreshCatalog(reason: SyncReason): Promise<void> {
    const due = reason === "start" || reason === "manual" || reason === "online" || now() - lastCatalogCheck > CATALOG_RECHECK_MS;
    if (!due || !isOnline()) return;
    lastCatalogCheck = now();
    try {
      const etag = await getMeta<string>(db, META_KEYS.catalogEtag);
      const res = await fetchImpl("/api/catalog", { headers: etag ? { "if-none-match": etag } : {}, credentials: "same-origin" });
      if (res.status !== 200) return; // 304: up to date; anything else (501 until the catalog ships): try again later
      const catalog = (await res.json()) as CatalogResponse;
      await repo.catalog.replace(catalog);
      await setMeta(db, META_KEYS.catalogEtag, res.headers.get("etag") ?? catalogEtag(catalog.version));
    } catch {
      /* the catalog is a cache: never fail a sync because of it */
    }
  }

  async function cycle(reason: SyncReason): Promise<SyncResult> {
    const result: SyncResult = { ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [] };
    const newPrs: PersonalRecordRow[] = [];
    status.set({ state: "syncing" });
    try {
      if (!isOnline()) throw new TypeError("offline");
      const deviceId = await ensureDeviceId(db);
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const batch = await readBatch(db);
        const cursor = (await getMeta<number>(db, META_KEYS.cursor)) ?? 0;
        const response = await postSync({ deviceId, cursor, clientHlc: await currentHlc(db), mutations: batch.mutations });
        const outcome = await applyResponse(db, batch, response);
        result.pushed += outcome.pushed;
        result.pulled += outcome.pulled;
        result.rejected += outcome.rejected;
        newPrs.push(...response.newPrs);
        if (outcome.rejected > 0) console.warn("[sync] rejected mutations", outcome.rejections);
        const remaining = await db.outbox.count();
        if (!response.hasMore && (remaining === 0 || batch.mutations.length === 0)) break;
      }
      result.newPrs = newPrs;
      await refreshCatalog(reason);
      status.set({
        state: "idle",
        pendingCount: await db.outbox.count(),
        lastSyncedAt: (await getMeta<string>(db, META_KEYS.lastSyncedAt)) ?? null,
        lastError: null,
        rejectedCount: result.rejected,
      });
      if (result.pushed > 0 || result.pulled > 0 || result.rejected > 0) {
        listeners.emit({ pushed: result.pushed, pulled: result.pulled, rejected: result.rejected, newPrs });
      }
      return result;
    } catch (error) {
      const pendingCount = await db.outbox.count().catch(() => 0);
      if (error instanceof HttpError && error.status === 401) {
        status.set({ state: "signed-out", pendingCount, lastError: "Signed out" });
      } else if (error instanceof HttpError) {
        status.set({ state: "error", pendingCount, lastError: error.message });
      } else {
        const message = error instanceof Error ? error.message : String(error);
        status.set({ state: "offline", pendingCount, lastError: message });
      }
      return { ...result, ok: false, error: error instanceof Error ? error.message : String(error), newPrs };
    }
  }

  async function syncNow(reason: SyncReason = "manual"): Promise<SyncResult> {
    const skipped: SyncResult = { ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [], skipped: true };
    const locks = options.locks ?? (typeof navigator !== "undefined" ? navigator.locks : undefined);
    if (locks) {
      return locks.request(`overload-sync-${db.userId}`, { ifAvailable: true }, async (lock) => (lock ? cycle(reason) : skipped)) as Promise<SyncResult>;
    }
    if (inProcessBusy) return skipped;
    inProcessBusy = true;
    try {
      return await cycle(reason);
    } finally {
      inProcessBusy = false;
    }
  }

  function start(): void {
    if (stopFns.length > 0) return;
    const writeDelay = options.writeDelayMs ?? WRITE_DELAY_MS;
    const interval = options.intervalMs ?? PENDING_INTERVAL_MS;
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    let pending = 0;

    // The outbox count is the single source of truth for "N changes waiting" (it also sees other tabs' writes).
    const subscription = liveQuery(() => db.outbox.count()).subscribe({
      next(count) {
        pending = count;
        status.set({ pendingCount: count });
        if (count > previousPending) {
          clearTimeout(writeTimer);
          writeTimer = setTimeout(() => void syncNow("write"), writeDelay);
        }
        previousPending = count;
      },
      error() {},
    });
    const intervalId = setInterval(() => {
      if (pending > 0) void syncNow("interval");
    }, interval);
    const onOnline = () => void syncNow("online");
    const onVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void syncNow("visibility");
    };
    if (typeof window !== "undefined") window.addEventListener("online", onOnline);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

    stopFns = [
      () => subscription.unsubscribe(),
      () => clearInterval(intervalId),
      () => clearTimeout(writeTimer),
      () => typeof window !== "undefined" && window.removeEventListener("online", onOnline),
      () => typeof document !== "undefined" && document.removeEventListener("visibilitychange", onVisible),
    ];
    void syncNow("start");
  }

  function stop(): void {
    for (const fn of stopFns) fn();
    stopFns = [];
    previousPending = 0;
  }

  return { db, syncNow, start, stop };
}

// ───────────────────────────── module-level surface (frozen signature) ─────────────────────────────

let activeEngine: Engine | null = null;

/** Called by SyncProvider: replaces (and stops) the previous engine. */
export function setActiveEngine(engine: Engine | null): void {
  if (activeEngine && activeEngine !== engine) activeEngine.stop();
  activeEngine = engine;
}

/** Run one sync cycle now (push outbox -> pull changes). navigator.locks keeps it to one at a time. */
export async function syncNow(_reason: SyncReason = "manual"): Promise<SyncResult> {
  if (!activeEngine) return { ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [], skipped: true };
  return activeEngine.syncNow(_reason);
}
