// Does the tab prefetch (components/shell/useTabPrefetch.ts) make the first dock tap on a freshly loaded page fast? Each repetition loads
// /today again (an empty router cache), then taps Exercises either at once (the control) or after DWELL_MS of the person looking at the page
// (the prefetch had idle time to finish). Throttled Pixel 7: CPU 4x, about 1.6 Mbps, 150 ms RTT. Production build only.
//   PERF=1 E2E_PROD=1 PORT=3003 pnpm exec playwright test --project=perf e2e/perf/prefetch.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { REPS, report, signInDemo, summarize, throttle, type PerfRow } from "./support";

const DWELL_MS = Number(process.env.PREFETCH_DWELL_MS ?? 5000);

async function tapExercises(page: Page): Promise<number> {
  const armed = page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        let t0 = 0;
        document.addEventListener("pointerdown", (e) => (t0 = performance.timeOrigin + e.timeStamp), { capture: true, once: true });
        const deadline = performance.now() + 30_000;
        const check = () => {
          const h1 = document.querySelector("main h1, h1");
          if (t0 && h1 && h1.textContent?.trim() === "Exercises" && location.pathname === "/exercises") return resolve(performance.timeOrigin + performance.now() - t0);
          if (performance.now() > deadline) return reject(new Error("timed out waiting for Exercises"));
          requestAnimationFrame(check);
        };
        check();
      }),
  );
  await page.locator('nav[aria-label="Primary (mobile)"] a[href="/exercises"]').tap();
  return armed;
}

test("first dock tap after loading /today: at once versus after a pause", async ({ page }) => {
  await signInDemo(page);
  await throttle(page);
  await page.goto("/today");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");

  const immediate: number[] = [];
  const dwelled: number[] = [];
  const prefetchRequests: number[] = [];
  for (let rep = 0; rep < REPS; rep++) {
    for (const dwell of [0, DWELL_MS]) {
      await page.goto("/today");
      await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({ timeout: 60_000 });
      let rsc = 0;
      const count = (request: { url(): string }) => void (/[?&]_rsc=/.test(request.url()) && rsc++);
      page.on("request", count);
      await page.waitForTimeout(dwell === 0 ? 300 : dwell);
      page.off("request", count);
      const ms = await tapExercises(page);
      (dwell === 0 ? immediate : dwelled).push(ms);
      if (dwell !== 0) prefetchRequests.push(rsc);
    }
  }
  const rows: PerfRow[] = [
    { metric: "tap Exercises 0.3 s after /today loaded: tap to heading", unit: "ms", summary: summarize(immediate) },
    { metric: `tap Exercises ${DWELL_MS / 1000} s after /today loaded: tap to heading`, unit: "ms", summary: summarize(dwelled) },
    { metric: "RSC requests made while the page sat idle (prefetch)", unit: "n", summary: summarize(prefetchRequests) },
  ];
  report("prefetch", rows, { immediate, dwelled, prefetchRequests, dwellMs: DWELL_MS });
});
