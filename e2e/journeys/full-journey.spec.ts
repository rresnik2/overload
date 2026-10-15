// The whole product in one pass, the way the owner will use it on an iPhone:
//   sign up -> verify (mocked inbox) -> onboarding -> /today -> offline workout -> online sync -> charts show the data -> insight card.
//   PORT=3000 E2E_PROD=1 INSIGHTS_E2E_FAKE=1 pnpm exec playwright test e2e/journeys --project=webkit-iphone
// Production builds (E2E_PROD=1) cache the app in the service worker, so the workout really is logged offline; under `next dev` there is no
// service worker, so the same steps run online and the offline leg is skipped. Verification mail needs the mocked inbox: dev only (see
// _support/db.ts), production builds mark the user verified directly. The insight narrative needs the fake model (INSIGHTS_E2E_FAKE=1).
import { expect, test, type Page } from "@playwright/test";
import { isProductionServer, testDb } from "../_support/db";
import { completeOnboarding, createUser, newPassword, signUpThroughForm, uniqueEmail, verifyEmail } from "../_support/user";

test.describe.configure({ timeout: 360_000 });

const COLD = { timeout: 60_000 };
const BENCH = "Barbell Bench Press - Medium Grip";

async function serverSets(email: string) {
  const prisma = await testDb();
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return prisma.workoutSet.count({ where: { userId: user.id, deletedAt: null, completedAt: { not: null } } });
}

async function logSet(page: Page, n: number, weight: string, reps: string) {
  const block = page.getByRole("region", { name: BENCH });
  await block.getByRole("textbox", { name: new RegExp(`^Set ${n} weight`) }).fill(weight);
  await block.getByRole("textbox", { name: `Set ${n} reps` }).fill(reps);
  await block.getByRole("button", { name: `Complete set ${n}` }).click();
  await expect(block.getByRole("button", { name: `Mark set ${n} not done` })).toBeVisible();
}

test("sign up to insight: the full journey", async ({ page, context, request }) => {
  const production = await isProductionServer(request);

  // ---- 1. Account: the real sign-up form and the mocked inbox (dev), or the API plus a database verify (production) ----
  let email: string;
  let password: string;
  if (production) {
    ({ email, password } = await createUser(page, { tag: "journey", name: "Journey Lifter" }));
  } else {
    email = uniqueEmail("journey");
    password = newPassword();
    await signUpThroughForm(page, email, password, "Journey Lifter");
    await verifyEmail(page, email);
    await completeOnboarding(page);
  }
  await expect(page).toHaveURL(/\/today$/);

  // ---- 2. /today for a brand-new user: invitations, then start a workout from the card ----
  await expect(page.getByText("No sets this week yet")).toBeVisible(COLD);
  await expect(page.getByText("Your first weekly review appears after a week of logged training.")).toBeVisible();
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page).toHaveURL(/\/workout$/, COLD);
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);

  // Let the service worker take over and the catalog land in Dexie before going offline.
  if (production) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller) || !("serviceWorker" in navigator), undefined, COLD).catch(() => undefined);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
  }
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await expect(page.getByRole("dialog").locator(".exercise-card").first()).toBeVisible(COLD);
  await page.keyboard.press("Escape");

  // ---- 3. Log a workout (offline on a production build) ----
  if (production) await context.setOffline(true);
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
  await picker.getByRole("button", { name: `Add ${BENCH}` }).first().click();
  await expect(page.getByRole("region", { name: BENCH })).toBeVisible();
  for (let n = 1; n <= 3; n++) {
    if (n > 1) await page.getByRole("region", { name: BENCH }).getByRole("button", { name: `Add set to ${BENCH}` }).click();
    await logSet(page, n, String(60 + n * 2.5), "8");
  }
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(page.getByTestId("finish-summary")).toBeVisible();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // ---- 4. Back online: the outbox drains and the server holds exactly those sets ----
  if (production) await context.setOffline(false);
  await expect.poll(() => serverSets(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toBe(3);
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, COLD);

  // ---- 5. Charts show the data: /today volume card, the progress overview, the series page ----
  await page.goto("/today");
  await expect(page.getByRole("region", { name: "This week's volume" })).toBeVisible(COLD);
  await expect(page.getByRole("button", { name: "Resume workout" })).toHaveCount(0); // the workout is finished
  await page.goto("/progress");
  const card = page.getByTestId("series-cards").getByRole("link").filter({ hasText: BENCH });
  await expect(card).toHaveCount(1, COLD);
  await expect(page.getByTestId("weekly-sets").first()).toBeVisible(COLD);
  await card.click();
  const chart = page.getByTestId("chart-e1rm");
  await expect(chart).toBeVisible(COLD);
  await expect(chart).toHaveAttribute("data-chart-state", "low-data"); // one session: honest about it
  await expect(page.getByTestId("low-data")).toContainText("Needs 6 sessions");
  await page.goto("/history");
  await expect(page.getByRole("article").first()).toContainText("3 sets", COLD);

  // ---- 6. Insight: rule cards always, the written review when the fake model is on ----
  await page.goto("/insights");
  await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible(COLD);
  const probe = await request.get("/api/cron/insights");
  if (probe.headers()["x-insights-fake-model"] === "1") {
    // The review covers the previous ISO week, so what it says depends on today's date (a workout logged on a Monday is not in it).
    // Assert only what is date-independent: a report is stored, and /today's card now links to it instead of inviting the first one.
    await page.getByRole("button", { name: "Write this week's review" }).click();
    await expect(page.getByText(/^Generated \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/)).toBeVisible(COLD);
    await page.goto("/today");
    await expect(page.getByRole("link", { name: "Read the full review" })).toBeVisible(COLD);
    await expect(page.getByText("Your first weekly review appears after a week of logged training.")).toHaveCount(0);
  } else {
    test.info().annotations.push({ type: "note", description: "fake insight model not enabled (INSIGHTS_E2E_FAKE=1): narrative step skipped" });
  }
});
