// The workout sync policy in a real browser (DIAL part PERF-3): while a workout is active, logging sets sends nothing; "Sync now"
// pushes at once; finishing syncs at once; outside a workout a write still syncs after 1.5 s. Counts what the page POSTs to /api/sync.
//   PORT=3003 E2E_PROD=1 pnpm exec playwright test e2e/journeys/sync-policy.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { logSetByTyping } from "../_support/logging";
import { createUser } from "../_support/user";

const EXERCISE = "Barbell Bench Press - Medium Grip";
const COLD = { timeout: 60_000 };

function countSyncs(page: Page) {
  const log: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/sync") log.push(request.url());
  });
  return log;
}

async function startWorkoutWithBench(page: Page) {
  await page.goto("/workout", COLD);
  await page.getByRole("button", { name: "Start empty workout" }).click(COLD);
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.locator(".exercise-card").first()).toBeVisible(COLD); // the catalog has synced into Dexie
  await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
  await picker.getByRole("button", { name: `Add ${EXERCISE}`, exact: true }).first().click();
  await expect(page.getByRole("region", { name: EXERCISE })).toBeVisible();
}

test("during a workout sets are not synced one by one; Sync now and Finish push at once", async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  await createUser(page, { tag: "syncpolicy", name: "Sync Policy" });
  const syncs = countSyncs(page);
  await startWorkoutWithBench(page);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible(COLD);
  await page.waitForTimeout(2500); // anything the start of the workout caused has gone out
  const before = syncs.length;

  const bench = page.getByRole("region", { name: EXERCISE });
  await logSetByTyping(bench, 1, "60", "8", isMobile);
  await page.waitForTimeout(4000); // far longer than the 1.5 s write delay of the old policy
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // coming back to the app mid-workout
  await page.waitForTimeout(500);
  expect(syncs.length, "a logged set must not trigger a sync during a workout").toBe(before);
  const button = page.getByRole("button", { name: /^Sync now: \d+ unsynced$/ });
  await expect(button).toBeVisible();

  await button.click();
  await expect(page.getByRole("button", { name: "Sync now: Synced" })).toBeVisible(COLD);
  expect(syncs.length).toBeGreaterThan(before);
  await expect(page.getByRole("status").filter({ hasText: "Synced. Everything is saved to your account." })).toHaveCount(1);

  // A second set, then Finish: the end of the workout syncs without being asked.
  const afterButton = syncs.length;
  const addSet = bench.getByRole("button", { name: `Add set to ${EXERCISE}` });
  await addSet.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await addSet.click();
  await logSetByTyping(bench, 2, "62.5", "8", isMobile);
  await page.waitForTimeout(3000);
  expect(syncs.length).toBe(afterButton);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible();
  await expect.poll(() => syncs.length, { timeout: 10_000 }).toBeGreaterThan(afterButton);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, COLD);
});

test("outside a workout a change is still synced about 1.5 s later", async ({ page }) => {
  test.setTimeout(120_000);
  await createUser(page, { tag: "syncwrite", name: "Sync Write" });
  const syncs = countSyncs(page);
  await page.goto("/exercises", COLD);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible(COLD);
  await page.waitForTimeout(2500); // the start-of-app sync and the catalog have finished
  const before = syncs.length;
  await page.getByRole("button", { name: /^Add .* to favorites$/ }).first().click(); // a write through the local database
  await expect.poll(() => syncs.length, { timeout: 8000 }).toBeGreaterThan(before);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, COLD);
});
