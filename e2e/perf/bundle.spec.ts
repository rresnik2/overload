// JavaScript and CSS each route downloads on a cold load (Next 16 no longer prints a size table). Service workers are blocked so
// every byte comes from the server. "raw" is the decoded body, "wire" the compressed transfer (next start gzips).
//   PERF=1 E2E_PROD=1 PORT=3003 pnpm exec playwright test --project=perf e2e/perf/bundle.spec.ts
import { expect, test, type Response } from "@playwright/test";
import { report, signInDemo, type PerfRow } from "./support";

test.use({ serviceWorkers: "block" });

const SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";
const ROUTES = ["/sign-in", "/today", "/exercises", "/progress", `/progress/${SQUAT}`, "/history", "/workout", "/settings/profile"] as const;

interface Bytes {
  raw: number;
  wire: number;
  files: number;
}

test("JS and CSS per route", async ({ page }) => {
  await signInDemo(page);
  // Every route is a cold load: without this the second page would get the shared chunks from the memory cache (0 KB on the wire).
  await (await page.context().newCDPSession(page)).send("Network.setCacheDisabled", { cacheDisabled: true });
  const results: Record<string, { js: Bytes; css: Bytes; blockingCss: Bytes; fonts: Bytes }> = {};
  for (const route of ROUTES) {
    const js: Bytes = { raw: 0, wire: 0, files: 0 };
    const css: Bytes = { raw: 0, wire: 0, files: 0 };
    const fonts: Bytes = { raw: 0, wire: 0, files: 0 };
    const pending: Promise<void>[] = [];
    const onResponse = (response: Response) => {
      const type = response.headers()["content-type"] ?? "";
      const bucket = /javascript/.test(type) ? js : /text\/css/.test(type) ? css : /font/.test(type) ? fonts : null;
      if (!bucket) return;
      pending.push(
        (async () => {
          const [body, sizes] = await Promise.all([response.body().catch(() => Buffer.alloc(0)), response.request().sizes().catch(() => null)]);
          bucket.raw += body.length;
          bucket.wire += sizes?.responseBodySize ?? 0;
          bucket.files += 1;
        })(),
      );
    };
    page.on("response", onResponse);
    await page.goto(route, { waitUntil: "load" });
    await page.waitForLoadState("networkidle");
    page.off("response", onResponse);
    await Promise.all(pending);
    // CSS that blocks rendering: <link rel=stylesheet> in the head without a media query that excludes the screen.
    const blockingCss = await page.evaluate(async () => {
      const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].filter((l) => !l.media || l.media === "all" || l.media === "screen");
      let raw = 0;
      for (const l of links) raw += (await (await fetch(l.href)).text()).length;
      return { raw, wire: 0, files: links.length };
    });
    results[route] = { js, css, blockingCss, fonts };
    expect(js.files, `${route} loaded no scripts`).toBeGreaterThan(0);
  }
  const rows: PerfRow[] = [];
  const one = (n: number) => ({ n: 1, median: n, p75: n, min: n, max: n });
  const kb = (n: number) => Math.round(n / 1024);
  for (const [route, r] of Object.entries(results)) {
    rows.push({ metric: `${route} JS`, unit: "KB", summary: one(kb(r.js.raw)), note: `${kb(r.js.wire)} KB wire, ${r.js.files} files` });
    rows.push({ metric: `${route} CSS`, unit: "KB", summary: one(kb(r.css.raw)), note: `${kb(r.css.wire)} KB wire, ${r.css.files} files, stylesheet links ${r.blockingCss.files} (${kb(r.blockingCss.raw)} KB raw)` });
    rows.push({ metric: `${route} fonts`, unit: "KB", summary: one(kb(r.fonts.raw)), note: `${r.fonts.files} files` });
  }
  report("bundle", rows, results);
});
