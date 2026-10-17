// Server time for the three dock pages, from the entries recorded when the server runs with OVERLOAD_SERVER_TIMING=1:
// REPS full document loads each (no throttling: this measures the server), plus TTFB from the browser for comparison.
import { expect, test } from "@playwright/test";
import { REPS, report, resetServerEntries, serverEntries, signInDemo, summarize, type PerfRow, type ServerEntry } from "./support";

const PATHS = ["/today", "/progress", "/exercises"] as const;

test("server time: /today, /progress, /exercises", async ({ page }) => {
  await signInDemo(page);
  const on = await resetServerEntries(page);
  const ttfb: Record<string, number[]> = {};

  // One warm-up per page (module init, connection pool), not counted.
  for (const path of PATHS) await page.goto(path);
  await resetServerEntries(page);

  for (let rep = 0; rep < REPS; rep++) {
    for (const path of PATHS) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      (ttfb[path] ??= []).push(await page.evaluate(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).responseStart));
    }
  }
  await page.waitForTimeout(500); // after() callbacks run once the response has finished

  const entries = (await serverEntries(page)) ?? [];
  const rows: PerfRow[] = [];
  const byPath: Record<string, ServerEntry[]> = {};
  for (const path of PATHS) {
    const mine = entries.filter((e) => e.kind === "html" && e.path === path);
    byPath[path] = mine;
    rows.push({ metric: `${path} TTFB (browser)`, unit: "ms", summary: summarize(ttfb[path] ?? []) });
    if (!on) {
      rows.push({ metric: `${path} server time`, unit: "ms", summary: null, note: "start the server with OVERLOAD_SERVER_TIMING=1" });
      continue;
    }
    rows.push({ metric: `${path} server total (proxy to end)`, unit: "ms", summary: mine.length ? summarize(mine.map((e) => e.totalMs), 1) : null });
    rows.push({ metric: `${path} db time (sum of queries)`, unit: "ms", summary: mine.length ? summarize(mine.map((e) => e.dbMs), 1) : null });
    rows.push({ metric: `${path} db wall time`, unit: "ms", summary: mine.length ? summarize(mine.map((e) => e.dbWallMs), 1) : null });
    rows.push({ metric: `${path} prisma queries`, unit: "n", summary: mine.length ? summarize(mine.map((e) => e.queries)) : null });
  }
  report("server", rows, { ttfb, byPath, serverTimingEnabled: on });
});
