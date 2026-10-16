// Dock tap to content visible: Today -> Exercises -> Progress -> Today, REPS times, on a throttled Pixel 7 (CPU 4x, ~1.6 Mbps, 150 ms RTT).
// For every tap: time from the tap's pointerdown until the target page's <h1> is on screen, and until the network is idle
// (nothing in flight for 500 ms). Also records the RSC request's server time (OVERLOAD_SERVER_TIMING=1) and the web vitals.
import { expect, test } from "@playwright/test";
import {
  flushVitals,
  REPS,
  report,
  resetServerEntries,
  serverEntries,
  signInDemo,
  summarize,
  throttle,
  type PerfRow,
} from "./support";

const STEPS = [
  { href: "/exercises", heading: "Exercises" },
  { href: "/progress", heading: "Progress" },
  { href: "/today", heading: "Today" },
] as const;

interface TapResult {
  href: string;
  rep: number;
  headingMs: number;
  idleMs: number;
  /** Tap to the route skeleton (loading.tsx) on screen; null when the page was ready first (router cache or fast response). */
  skeletonMs: number | null;
  /** Tap to the first thing that answers it: the skeleton, or the heading when there was no skeleton. */
  feedbackMs: number;
}

test("dock taps: Today -> Exercises -> Progress -> Today", async ({ page }) => {
  await signInDemo(page);
  const serverOn = await resetServerEntries(page);

  // Warm-up load under the throttle: JS, CSS and fonts cached like a returning visit, the service worker installed.
  await throttle(page);
  await page.goto("/today?vitals=1");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // In-flight request tracking, to find when the network goes idle after a tap.
  let inflight = 0;
  let lastActivity = Date.now();
  const bump = () => {
    lastActivity = Date.now();
  };
  page.on("request", () => {
    inflight++;
    bump();
  });
  page.on("requestfinished", () => {
    inflight--;
    bump();
  });
  page.on("requestfailed", () => {
    inflight--;
    bump();
  });

  const dock = page.locator('nav[aria-label="Primary (mobile)"]');
  const results: TapResult[] = [];

  for (let rep = 1; rep <= REPS; rep++) {
    for (const step of STEPS) {
      // Armed before the tap: records the pointerdown time and polls (every frame) until the target h1 shows.
      const armed = page.evaluate(
        ({ href, heading }) =>
          new Promise<{ t0: number; tHeading: number; tSkeleton: number | null }>((resolve, reject) => {
            let t0 = 0;
            let tSkeleton: number | null = null;
            document.addEventListener("pointerdown", (e) => (t0 = performance.timeOrigin + e.timeStamp), { capture: true, once: true });
            const deadline = performance.now() + 30_000;
            const check = () => {
              if (t0 && tSkeleton === null && document.querySelector("main .skel-page")) tSkeleton = performance.timeOrigin + performance.now();
              const h1 = document.querySelector("main h1, h1");
              const shown = h1 && h1.textContent?.trim() === heading && location.pathname === href && h1.getBoundingClientRect().height > 0;
              if (t0 && shown) return resolve({ t0, tHeading: performance.timeOrigin + performance.now(), tSkeleton });
              if (performance.now() > deadline) return reject(new Error(`timed out waiting for ${heading}`));
              requestAnimationFrame(check);
            };
            check();
          }),
        step,
      );
      await dock.locator(`a[href="${step.href}"]`).tap();
      const { t0, tHeading, tSkeleton } = await armed;

      // Network idle: nothing in flight for 500 ms after the heading (or after the last request, if later).
      while (inflight > 0 || Date.now() - lastActivity < 500) await page.waitForTimeout(50);
      const idleAt = Math.max(tHeading, lastActivity);
      results.push({
        href: step.href,
        rep,
        headingMs: tHeading - t0,
        idleMs: idleAt - t0,
        skeletonMs: tSkeleton === null ? null : tSkeleton - t0,
        feedbackMs: (tSkeleton ?? tHeading) - t0,
      });
      await page.waitForTimeout(400); // let transitions and post-navigation work finish before the next tap
    }
  }

  const vitals = await flushVitals(page);
  const entries = await serverEntries(page);

  const rows: PerfRow[] = [];
  for (const step of STEPS) {
    const mine = results.filter((r) => r.href === step.href);
    rows.push({ metric: `tap -> ${step.href} heading`, unit: "ms", summary: summarize(mine.map((r) => r.headingMs)) });
    rows.push({ metric: `tap -> ${step.href} network idle`, unit: "ms", summary: summarize(mine.map((r) => r.idleMs)) });
  }
  rows.push({ metric: "tap -> heading, all taps", unit: "ms", summary: summarize(results.map((r) => r.headingMs)) });
  const skeletonTaps = results.filter((r) => r.skeletonMs !== null);
  rows.push({
    metric: "tap -> skeleton visible (taps that showed one)",
    unit: "ms",
    summary: skeletonTaps.length ? summarize(skeletonTaps.map((r) => r.skeletonMs as number)) : null,
    note: `${skeletonTaps.length} of ${results.length} taps showed a skeleton`,
  });
  rows.push({ metric: "tap -> first feedback (skeleton, else heading), all taps", unit: "ms", summary: summarize(results.map((r) => r.feedbackMs)) });
  if (entries) {
    for (const step of STEPS) {
      const rsc = entries.filter((e) => e.kind === "rsc" && e.path === step.href);
      rows.push({ metric: `server ${step.href} (RSC) total`, unit: "ms", summary: rsc.length ? summarize(rsc.map((e) => e.totalMs), 1) : null });
      rows.push({ metric: `server ${step.href} (RSC) queries`, unit: "n", summary: rsc.length ? summarize(rsc.map((e) => e.queries)) : null });
    }
  } else {
    rows.push({ metric: "server time (RSC)", unit: "ms", summary: null, note: "start the server with OVERLOAD_SERVER_TIMING=1" });
  }
  const inp = vitals.filter((v) => v.name === "INP").at(-1);
  rows.push({ metric: "INP (vitals)", unit: "ms", summary: inp ? summarize([inp.value]) : null, note: inp?.rating });

  report("navigation", rows, { results, vitals, serverEntries: entries, serverTimingEnabled: serverOn });
  expect(results).toHaveLength(REPS * STEPS.length);
});
