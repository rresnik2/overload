// Shared helpers for the perf harness (project `perf`, see docs/perf/baseline.md).
//   PERF=1 E2E_PROD=1 PORT=3004 OVERLOAD_SERVER_TIMING=1 pnpm exec playwright test --project=perf
// Signs in as the demo user (prisma/seed/fixtures.ts: 16 weeks of history), throttles the CPU and network through CDP, and
// collects what the specs measure in the page: long tasks, event timing, DOM mutation times and the web vitals buffer.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, type CDPSession, type Page } from "@playwright/test";
import { resetRateLimitsIfProduction } from "../_support/user";

export const DEMO_EMAIL = "demo@overload.test";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";

/** Repetitions per measurement. */
export const REPS = Number(process.env.PERF_REPS ?? 5);

/** CPU slowdown and network profile: a mid-range Android phone on a poor connection. */
export const THROTTLE = {
  cpuRate: 4,
  downKbps: 1600,
  upKbps: 750,
  rttMs: 150,
} as const;

export async function signInDemo(page: Page): Promise<void> {
  await resetRateLimitsIfProduction(page);
  const origin = new URL(page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`) : page.url()).origin;
  const res = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `demo sign-in responded ${res.status()}: is the demo user seeded (pnpm exec tsx prisma/seed/fixtures.ts)?`).toBe(true);
}

/** CPU 4x and the slow network for everything this page does from now on. Returns the session so a spec can lift it again. */
export async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE.cpuRate });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: THROTTLE.rttMs,
    downloadThroughput: (THROTTLE.downKbps * 1000) / 8,
    uploadThroughput: (THROTTLE.upKbps * 1000) / 8,
  });
  return cdp;
}

export async function unthrottle(cdp: CDPSession): Promise<void> {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}

// ---- statistics ---------------------------------------------------------------------------------------------------

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  // Linear interpolation between closest ranks.
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (rank - lo);
}

export const median = (v: readonly number[]): number => percentile(v, 50);
export const p75 = (v: readonly number[]): number => percentile(v, 75);
export const round = (n: number, digits = 0): number => (Number.isFinite(n) ? Math.round(n * 10 ** digits) / 10 ** digits : n);

export interface Summary {
  n: number;
  median: number;
  p75: number;
  min: number;
  max: number;
}

export function summarize(values: readonly number[], digits = 0): Summary {
  return {
    n: values.length,
    median: round(median(values), digits),
    p75: round(p75(values), digits),
    min: round(Math.min(...values), digits),
    max: round(Math.max(...values), digits),
  };
}

// ---- reporting ----------------------------------------------------------------------------------------------------

const OUT_DIR = path.resolve("test-results/perf");

export interface PerfRow {
  metric: string;
  unit: string;
  summary: Summary | null;
  note?: string;
}

/** Writes test-results/perf/<name>.json (raw samples included) and prints the table. */
export function report(name: string, rows: readonly PerfRow[], raw: unknown): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const meta = { name, at: new Date().toISOString(), baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`, throttle: THROTTLE, reps: REPS };
  writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify({ meta, rows, raw }, null, 2));
  const width = Math.max(...rows.map((r) => r.metric.length), 6);
  const lines = rows.map((r) => {
    const s = r.summary;
    const cells = s ? `median ${String(s.median).padStart(8)}  p75 ${String(s.p75).padStart(8)}  min ${String(s.min).padStart(8)}  max ${String(s.max).padStart(8)}  n=${s.n}` : "n/a";
    return `  ${r.metric.padEnd(width)}  ${r.unit.padEnd(4)}  ${cells}${r.note ? `  (${r.note})` : ""}`;
  });
  console.log(`\nperf: ${name}\n${lines.join("\n")}\n  -> test-results/perf/${name}.json\n`);
}

// ---- in-page measurement ------------------------------------------------------------------------------------------

export interface LongTaskStats {
  count: number;
  totalMs: number;
  /** Sum of (duration - 50): total blocking time. */
  blockingMs: number;
  maxMs: number;
}

/** Observers installed before an interaction; read back with `readProbe`. Lives on window.__perfProbe. */
export async function installProbe(page: Page, opts: { mutationRoot?: string; mutationFilter?: string } = {}): Promise<void> {
  await page.evaluate((o) => {
    const w = window as unknown as { __perfProbe?: { stop: () => void } };
    w.__perfProbe?.stop();
    const longTasks: { start: number; duration: number }[] = [];
    const events: { name: string; start: number; duration: number; processingStart: number; interactionId: number }[] = [];
    const mutations: number[] = [];
    const input: { type: string; t: number }[] = [];
    const lt = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ start: e.startTime, duration: e.duration });
    });
    try {
      lt.observe({ type: "longtask" });
    } catch {
      /* not supported */
    }
    const ev = new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { name: string; startTime: number; duration: number; processingStart: number; interactionId: number }[]) {
        events.push({ name: e.name, start: e.startTime, duration: e.duration, processingStart: e.processingStart, interactionId: e.interactionId });
      }
    });
    try {
      ev.observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
    } catch {
      /* not supported */
    }
    const note = (e: Event) => input.push({ type: e.type, t: e.timeStamp });
    for (const t of ["pointerdown", "pointermove", "pointerup", "keydown"]) document.addEventListener(t, note, { capture: true, passive: true });
    let mo: MutationObserver | null = null;
    if (o.mutationRoot) {
      const root = document.querySelector(o.mutationRoot);
      if (root) {
        let last = "";
        mo = new MutationObserver(() => {
          // Only count it when the text of the watched element actually changed (the readout), or always when no filter is given.
          if (o.mutationFilter) {
            const el = document.querySelector(o.mutationFilter);
            const text = el?.textContent ?? "";
            if (text === last) return;
            last = text;
          }
          mutations.push(performance.now());
        });
        if (o.mutationFilter) last = document.querySelector(o.mutationFilter)?.textContent ?? "";
        mo.observe(root, { childList: true, characterData: true, subtree: true });
      }
    }
    (window as unknown as { __perfProbeData: unknown }).__perfProbeData = { longTasks, events, mutations, input };
    w.__perfProbe = {
      stop: () => {
        lt.disconnect();
        ev.disconnect();
        mo?.disconnect();
        for (const t of ["pointerdown", "pointermove", "pointerup", "keydown"]) document.removeEventListener(t, note, { capture: true });
      },
    };
  }, opts);
}

export interface ProbeData {
  longTasks: { start: number; duration: number }[];
  events: { name: string; start: number; duration: number; processingStart: number; interactionId: number }[];
  mutations: number[];
  input: { type: string; t: number }[];
}

export async function readProbe(page: Page): Promise<ProbeData> {
  return page.evaluate(() => (window as unknown as { __perfProbeData: ProbeData }).__perfProbeData);
}

/** Clears what the probe collected so far (keeps observers running). */
export async function resetProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = (window as unknown as { __perfProbeData: ProbeData }).__perfProbeData;
    d.longTasks.length = 0;
    d.events.length = 0;
    d.mutations.length = 0;
    d.input.length = 0;
  });
}

/** The page-side counter object and the IndexedDB patch, as one script (run at document start so the patch lives in the page's own world). */
const WORK_COUNTER_SCRIPT = `(() => {
  if (window.__perfWork) return;
  const work = { rw: 0, ro: 0, records: 0, batches: 0 };
  window.__perfWork = work;
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    if (args[1] === "readwrite") work.rw += 1;
    else work.ro += 1;
    return original.apply(this, args);
  };
})();`;

/**
 * Counts what one gesture costs the page, cheaply and without a dev build: IndexedDB transactions (a Dexie write is one
 * read-write transaction) and, for the whole subtree under `root`, DOM mutation records and the batches they arrived in (one batch is
 * roughly one React commit). Call `countIndexedDb` before the first navigation, `installWorkCounters` once the screen is up; read with
 * `readWork`, clear with `resetWork`.
 */
export async function countIndexedDb(page: Page): Promise<void> {
  await page.addInitScript(WORK_COUNTER_SCRIPT);
}

export async function installWorkCounters(page: Page, root = ".wk-active"): Promise<void> {
  await page.evaluate(
    ({ script, rootSelector }) => {
      (0, eval)(script); // a no-op when the init script already ran
      const work = (window as unknown as { __perfWork: { records: number; batches: number } }).__perfWork;
      const el = document.querySelector(rootSelector);
      if (el) {
        new MutationObserver((records) => {
          work.records += records.length;
          work.batches += 1;
        }).observe(el, { childList: true, characterData: true, attributes: true, subtree: true });
      }
    },
    { script: WORK_COUNTER_SCRIPT, rootSelector: root },
  );
}

export interface WorkCounts {
  rw: number;
  ro: number;
  records: number;
  batches: number;
}

export async function readWork(page: Page): Promise<WorkCounts> {
  return page.evaluate(() => ({ ...(window as unknown as { __perfWork: WorkCounts }).__perfWork }));
}

export async function resetWork(page: Page): Promise<void> {
  await page.evaluate(() => {
    const work = (window as unknown as { __perfWork: WorkCounts }).__perfWork;
    work.rw = 0;
    work.ro = 0;
    work.records = 0;
    work.batches = 0;
  });
}

/** Chrome's own counters (CDP Performance.getMetrics): style recalculations, layouts and script time since `Performance.enable`. */
export async function browserMetrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics } = (await cdp.send("Performance.getMetrics")) as { metrics: { name: string; value: number }[] };
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

export function longTaskStats(tasks: readonly { start: number; duration: number }[], from = -Infinity, to = Infinity): LongTaskStats {
  const inWindow = tasks.filter((t) => t.start + t.duration >= from && t.start <= to);
  return {
    count: inWindow.length,
    totalMs: round(inWindow.reduce((a, t) => a + t.duration, 0)),
    blockingMs: round(inWindow.reduce((a, t) => a + Math.max(0, t.duration - 50), 0)),
    maxMs: round(Math.max(0, ...inWindow.map((t) => t.duration))),
  };
}

// ---- web vitals ---------------------------------------------------------------------------------------------------

export interface VitalsEntry {
  name: string;
  value: number;
  rating: string;
  navigationType?: string;
  navigationURL?: string;
}

/**
 * INP (and LCP, CLS) are only finalised when the page is hidden. Fake that so web-vitals reports what it has, then read
 * window.__overloadVitals (src/app/web-vitals.tsx).
 */
export async function flushVitals(page: Page): Promise<VitalsEntry[]> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => (window as unknown as { __overloadVitals?: VitalsEntry[] }).__overloadVitals ?? []);
}

// ---- server timing (OVERLOAD_SERVER_TIMING=1) ----------------------------------------------------------------------

export interface ServerEntry {
  path: string;
  kind: "html" | "rsc";
  at: number;
  queries: number;
  dbMs: number;
  dbWallMs: number;
  totalMs: number;
}

/** null when the server was not started with OVERLOAD_SERVER_TIMING=1. */
export async function serverEntries(page: Page): Promise<ServerEntry[] | null> {
  const res = await page.request.get("/api/perf/server-timing");
  if (res.status() === 404) return null;
  return (await res.json()) as ServerEntry[];
}

export async function resetServerEntries(page: Page): Promise<boolean> {
  return (await page.request.delete("/api/perf/server-timing")).status() === 204;
}

// ---- workout page -------------------------------------------------------------------------------------------------

/** /workout with an empty workout started and one exercise added: the phone panel with the dial and the reps strip is showing. */
export async function startWorkoutWithExercise(page: Page, search: string, name: string): Promise<void> {
  await page.goto("/workout?vitals=1");
  await page.getByRole("button", { name: "Start empty workout" }).click({ timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 }); // the catalog has synced into Dexie
  await picker.getByPlaceholder("Search exercises").fill(search);
  await picker.getByRole("button", { name: `Add ${name}`, exact: true }).first().click();
  await expect(page.getByRole("region", { name })).toBeVisible();
}

/**
 * Leaves no active workout behind (the demo user's account is shared): discards it through the UI, then lets the outbox drain.
 * Best effort: a failure here must not fail a measurement that already succeeded.
 */
export async function discardWorkout(page: Page): Promise<void> {
  try {
    await page.goto("/workout");
    await page.locator("summary[aria-label=\"Workout options\"]").click({ timeout: 30_000 });
    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard workout" }).click();
    // The in-page view lags the discard; a fresh load shows the settled state.
    await page.waitForTimeout(3000);
    await page.goto("/workout");
    await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, { timeout: 60_000 });
  } catch (error) {
    console.warn(`perf: could not discard the workout, remove it by hand: ${String(error).slice(0, 200)}`);
  }
}
