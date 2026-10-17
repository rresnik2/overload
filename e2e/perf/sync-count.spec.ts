// How many requests does the app send while the lifter logs a 10-set workout? Counts what the page itself requests:
// POST /api/sync, GET /api/catalog, and RSC fetches (`_rsc=` / `RSC: 1`, which `router.refresh()` and navigation produce).
//   PERF=1 E2E_PROD=1 PORT=3003 pnpm exec playwright test --project=perf e2e/perf/sync-count.spec.ts
// SYNC_SET_GAP_MS is the pause between sets (default 3000, so the whole run is about a minute); SYNC_LABEL names the output file.
// A gap of 36000 makes the workout last more than 5 minutes, which is what exercises the "once every 5 minutes" rule.
// The workout is discarded at the end (the demo user's account is shared), and the discard's own sync is counted separately.
import { expect, test, type Page, type Request } from "@playwright/test";
import { logSetByTyping } from "../_support/logging";
import { discardWorkout, report, signInDemo, startWorkoutWithExercise, type PerfRow } from "./support";

const EXERCISE = "Barbell Bench Press - Medium Grip";
const SETS = 10;
const GAP_MS = Number(process.env.SYNC_GAP_MS ?? process.env.SYNC_SET_GAP_MS ?? 3000);
const LABEL = process.env.SYNC_LABEL ?? `sync-count-${GAP_MS}`;

interface Counted {
  t: number;
  kind: "sync" | "catalog" | "rsc";
  url: string;
}

function classify(request: Request): Counted["kind"] | null {
  const url = new URL(request.url());
  if (url.pathname === "/api/sync" && request.method() === "POST") return "sync";
  if (url.pathname === "/api/catalog") return "catalog";
  if (url.searchParams.has("_rsc") || request.headers()["rsc"] === "1") return "rsc";
  return null;
}

async function addSet(page: Page, name: string) {
  const toasts = page.locator(".toast-region .toast");
  for (let i = 0; i < 3 && (await toasts.count()) > 0; i++) await page.getByRole("button", { name: "Dismiss notification" }).first().click();
  const button = page.getByRole("region", { name }).getByRole("button", { name: `Add set to ${name}` });
  await button.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await button.click();
}

test("requests during a scripted 10-set workout", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await signInDemo(page);
  const counted: Counted[] = [];
  let t0 = 0;
  page.on("request", (request) => {
    const kind = classify(request);
    if (kind && t0) counted.push({ t: Math.round(performance.now() - t0), kind, url: new URL(request.url()).pathname + new URL(request.url()).search.slice(0, 40) });
  });

  await startWorkoutWithExercise(page, "barbell bench press", EXERCISE);
  await page.waitForTimeout(3000); // let the start-of-workout syncs settle: they are not part of what is measured
  t0 = performance.now();
  const block = page.getByRole("region", { name: EXERCISE });
  for (let n = 1; n <= SETS; n++) {
    if (n > 1) await addSet(page, EXERCISE);
    await logSetByTyping(block, n, String(60 + n * 2.5), String(10 - (n % 4)), true);
    await page.waitForTimeout(GAP_MS);
  }
  const loggingMs = Math.round(performance.now() - t0);
  const duringWorkout = counted.slice();
  await expect(page.locator('.wk-set[data-state="completed"]')).toHaveCount(SETS);

  // End of the workout: discard (the same immediate sync as Finish).
  const tEnd = counted.length;
  await page.locator('summary[aria-label="Workout options"]').click();
  await page.getByRole("button", { name: "Discard workout" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Discard workout" }).click();
  await page.waitForTimeout(6000);
  const afterEnd = counted.slice(tEnd);
  t0 = 0;
  // Clean-up if the UI discard above did not finish.
  if (!(await page.getByRole("button", { name: "Start empty workout" }).isVisible())) await discardWorkout(page);

  const count = (list: Counted[], kind: Counted["kind"]) => list.filter((c) => c.kind === kind).length;
  const row = (metric: string, n: number, note?: string): PerfRow => ({ metric, unit: "n", summary: { n: 1, median: n, p75: n, min: n, max: n }, note });
  const rows: PerfRow[] = [
    row(`POST /api/sync while logging ${SETS} sets (${Math.round(loggingMs / 1000)} s)`, count(duringWorkout, "sync")),
    row("GET /api/catalog while logging", count(duringWorkout, "catalog")),
    row("RSC fetches while logging (router.refresh and prefetch)", count(duringWorkout, "rsc")),
    row("POST /api/sync in the 6 s after Discard", count(afterEnd, "sync")),
    row("RSC fetches in the 6 s after Discard", count(afterEnd, "rsc")),
  ];
  report(LABEL, rows, { gapMs: GAP_MS, loggingMs, duringWorkout, afterEnd });
});
