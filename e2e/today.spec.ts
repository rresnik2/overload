// /today: the composed home screen. A brand-new user sees invitations, not blank charts; the seeded demo lifter (demo@overload.test,
// `pnpm exec tsx prisma/seed/fixtures.ts`) sees the four e1RM tiles and the 12-week chart. Starting a workout hands over to /workout.
// No date-dependent assertions: "this week" can legitimately be empty for the demo history.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { logSetByTyping } from "./_support/logging";
import { createUser, resetRateLimitsIfProduction } from "./_support/user";

test.describe.configure({ timeout: 120_000 });

// Test-only credentials of the seeded demo account (prisma/seed/fixtures.ts). Never a real account.
const DEMO_EMAIL = "demo@overload.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";
const origin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;
const COLD = { timeout: 30_000 };

async function signInDemo(page: Page) {
  await resetRateLimitsIfProduction(page);
  for (let attempt = 0; ; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", { headers: { origin: origin() }, data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    if (res.ok()) return;
    if (attempt >= 3) throw new Error(`demo sign-in failed (${res.status()}): is the demo user seeded? Run: pnpm exec tsx prisma/seed/fixtures.ts`);
    await resetRateLimitsIfProduction(page);
  }
}

test("a brand-new user sees an empty state on every card and can start a workout", async ({ page }) => {
  await createUser(page, { tag: "today", name: "Today Tester" });
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start a workout" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No sets this week yet")).toBeVisible();
  await expect(page.getByText("No weigh-ins yet").or(page.getByRole("region", { name: "Bodyweight trend" }))).toBeVisible();
  await expect(page.getByText("Your first weekly review appears after a week of logged training.")).toBeVisible();

  // The four e1RM tiles each invite a first set, and the chart has nothing to plot yet.
  const tiles = page.getByTestId("e1rm-tiles").getByRole("listitem");
  await expect(tiles).toHaveCount(4);
  await expect(tiles.filter({ hasText: "Log a set to see your estimate" })).toHaveCount(4);
  await expect(page.getByTestId("e1rm-chart")).toHaveAttribute("data-chart-state", "empty");
  await expect(page.getByText("No estimate to chart yet")).toBeVisible();

  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page).toHaveURL(/\/workout$/, { timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible({ timeout: 30_000 });

  // Back on /today the card offers to resume it.
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Resume workout" })).toBeVisible({ timeout: 30_000 });
});

test("a lifter with history sees four tiles with estimates and the e1RM chart", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible(COLD);

  const tiles = page.getByTestId("e1rm-tiles").getByRole("listitem");
  await expect(tiles).toHaveCount(4);
  // The demo lifter squats, benches and presses but has never deadlifted.
  for (const name of ["Back squat", "Bench press", "Overhead press"]) {
    const tile = tiles.filter({ hasText: name });
    await expect(tile).toHaveAttribute("data-state", "filled");
    await expect(tile).toContainText(/\d+(\.\d)?\s*kg/i);
  }
  const deadlift = tiles.filter({ hasText: "Deadlift" });
  await expect(deadlift).toHaveAttribute("data-state", "empty");
  await expect(deadlift).toContainText("Log a set to see your estimate");

  // The chart is for a stalled lift, else bench; either way it plots at least one session over 12 weeks.
  const chart = page.getByTestId("e1rm-chart");
  await expect(chart).toHaveAttribute("data-chart-state", "ready");
  await expect(chart.getByRole("img", { name: /e1RM · 12 weeks$/ })).toBeVisible();
  expect(await chart.locator(".today-chart__dot").count()).toBeGreaterThan(0);
  await chart.getByText("View as table").click();
  await expect(chart.getByRole("table")).toBeVisible();
});

test("the layout follows the breakpoints: one column, two columns, three columns", async ({ page }) => {
  await signInDemo(page);
  const left = async (selector: string) => (await page.locator(selector).boundingBox())!.x;
  const top = async (selector: string) => (await page.locator(selector).boundingBox())!.y;

  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/today");
  await expect(page.getByTestId("e1rm-tiles")).toBeVisible(COLD);
  expect(await left(".today-cell--tiles")).toBe(await left(".today-cell--start"));
  // Under 768 px the tiles sit after the templates card and before the hard sets.
  expect(await top(".today-cell--tiles")).toBeGreaterThan(await top(".today-cell--templates"));
  expect(await top(".today-cell--sets")).toBeGreaterThan(await top(".today-cell--tiles"));

  await page.setViewportSize({ width: 900, height: 900 });
  expect(await left(".today-cell--tiles")).toBeGreaterThan(await left(".today-cell--start"));
  expect(await left(".today-cell--chart")).toBe(await left(".today-cell--tiles"));
  expect(await top(".today-cell--sets")).toBeGreaterThan(await top(".today-cell--chart"));

  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await left(".today-cell--sets")).toBeGreaterThan(await left(".today-cell--tiles"));
  expect(await left(".today-cell--tiles")).toBeGreaterThan(await left(".today-cell--start"));
  const start = (await page.locator(".today-cell--start").boundingBox())!;
  expect(Math.round(start.width)).toBe(290);
});

for (const theme of ["paper", "ink"] as const) {
  test(`axe: /today has no violations in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    await createUser(page, { tag: "today-axe" });
    await page.goto("/today");
    await expect(page.getByRole("region", { name: "Start a workout" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "paper" ? "overload-daylight" : "overload-floor");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  test(`axe: /today with tiles and the chart has no violations in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    await signInDemo(page);
    await page.goto("/today");
    await expect(page.getByTestId("e1rm-chart")).toHaveAttribute("data-chart-state", "ready", COLD);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "paper" ? "overload-daylight" : "overload-floor");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

// next.config.ts keeps visited pages in the client router cache for 30 s (staleTimes.dynamic). These two specs navigate with in-app
// links only (no reloads), so a page that was just visited is served from that cache unless something refreshes it.
test("the router cache never hides a finished workout: Today shows it without a reload", async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  await createUser(page, { tag: "stale-workout", name: "Stale Workout" });
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByText("No sets this week yet")).toBeVisible(COLD); // Today (empty) is now in the router cache

  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page).toHaveURL(/\/workout$/, COLD);
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.locator(".exercise-card").first()).toBeVisible(COLD);
  await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
  const bench = "Barbell Bench Press - Medium Grip";
  await picker.getByRole("button", { name: `Add ${bench}`, exact: true }).first().click();
  await logSetByTyping(page.getByRole("region", { name: bench }), 1, "62.5", "8", isMobile);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // Back by an in-app link, seconds after Today was cached. The sync push lands a moment later; either way Today must update itself.
  await page.locator(".wk-topbar__back").click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("today-hard-sets").getByRole("listitem").filter({ hasText: "Chest" })).toBeVisible({ timeout: 60_000 });
});

test("a settings change reaches pages visited in the last 30 seconds", async ({ page }) => {
  test.setTimeout(180_000);
  await createUser(page, { tag: "stale-units", name: "Stale Units" });
  await expect(page).toHaveURL(/\/today$/);
  const nav = (name: string) => page.getByRole("link", { name, exact: true }).first();

  await nav("Progress").click();
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible(COLD);
  await nav("Body").click();
  await expect(page.getByRole("heading", { name: "Body", level: 1 })).toBeVisible(COLD);
  await expect(page.locator(".field__unit").first()).toHaveText("kg"); // /progress/body is now in the router cache

  await page.getByRole("link", { name: /account settings/ }).click();
  await expect(page.getByRole("form", { name: "Profile" })).toBeVisible(COLD);
  await page.getByLabel("Weight unit").selectOption("LB");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Saved.")).toBeVisible(COLD);

  await nav("Progress").click();
  await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible(COLD);
  await nav("Body").click();
  await expect(page.getByRole("heading", { name: "Body", level: 1 })).toBeVisible(COLD);
  await expect(page.locator(".field__unit").first()).toHaveText("lb");
});
