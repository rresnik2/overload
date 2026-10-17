// Server pages are re-rendered after a sync only when the sync brought something the page lacks (DIAL part D1).
// Each synced-data server page carries the SyncState.version it was rendered at; the hook compares it with the version the sync reached.
//   PORT=3002 E2E_PROD=1 pnpm exec playwright test e2e/journeys/server-refresh.spec.ts
// A refresh is a GET with the `RSC: 1` header and no `Next-Router-Prefetch`; prefetches and plain navigations are told apart below.
import { expect, test, type Page, type Request } from "@playwright/test";
import { createUser } from "../_support/user";

const COLD = { timeout: 60_000 };

/** Counts RSC fetches for `path` that are neither prefetches nor part of a navigation the test made. */
function countRscFetches(page: Page, path: string) {
  const urls: string[] = [];
  page.on("request", (request: Request) => {
    const headers = request.headers();
    if (request.method() !== "GET" || headers["rsc"] !== "1" || headers["next-router-prefetch"]) return;
    const url = new URL(request.url());
    if (url.pathname === path) urls.push(url.pathname + url.search);
  });
  return urls;
}

test("a new user's first load does not re-render /today after the start-of-app sync pulled rows the page already showed", async ({ page }) => {
  test.setTimeout(180_000);
  const refreshes = countRscFetches(page, "/today");
  await createUser(page, { tag: "refresh0", name: "Refresh Quiet" }); // ends on /today, the sync pulling the onboarding rows
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible(COLD);
  const settled = refreshes.length;
  // The old hook re-rendered the page about 2 s after arrival (and WebKit then failed the next page.goto as "interrupted").
  await page.waitForTimeout(5000);
  expect(refreshes.length, `unexpected server re-render of /today: ${refreshes.slice(settled).join(", ")}`).toBe(settled);
  await page.goto("/exercises", COLD); // and a navigation straight after is not interrupted
  await expect(page.getByRole("heading", { name: "Exercises", level: 1 })).toBeVisible(COLD);
});

test("a change this device pushes still re-renders the server page that was rendered before it", async ({ page }) => {
  test.setTimeout(180_000);
  await createUser(page, { tag: "refresh1", name: "Refresh Push" });
  const refreshes = countRscFetches(page, "/exercises");
  await page.goto("/exercises", COLD);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible(COLD);
  await page.waitForTimeout(2500); // the start-of-app sync and the catalog have finished
  const before = refreshes.length;
  await page.getByRole("button", { name: /^Add .* to favorites$/ }).first().click(); // a write through the local database, pushed 1.5 s later
  await expect.poll(() => refreshes.length, { timeout: 15_000, message: "the pushed favorite should re-render /exercises" }).toBeGreaterThan(before);
  await expect(page.getByRole("button", { name: /^Remove .* from favorites$/ }).first()).toBeVisible(COLD);
});
