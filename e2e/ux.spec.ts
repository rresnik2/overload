// Stream UX: in-app hints, template access and the lose-weight goal.
//   PORT=3005 E2E_PROD=1 pnpm exec playwright test e2e/ux.spec.ts
// One user per worker (sign-up is rate-limited in production builds); the tests share its session and its data.
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { logSetByTyping } from "./_support/logging";
import { completeOnboarding, createUser, createUserAtOnboarding } from "./_support/user";
import { THEME_NAMES } from "@/lib/theme";

const COLD = { timeout: 45_000 };

type WorkerFixtures = { authState: Awaited<ReturnType<BrowserContext["storageState"]>> };
const test = base.extend<object, WorkerFixtures>({
  authState: [
    async ({ browser }, provide) => {
      const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await createUser(page, { tag: "ux", name: "UX Tester" });
      const state = await context.storageState();
      await context.close();
      await provide(state);
    },
    { scope: "worker", timeout: 120_000 },
  ],
  storageState: async ({ authState }, provide) => {
    await provide(authState);
  },
});

test.describe.configure({ timeout: 180_000 });

/** The element is fully inside the viewport. */
async function expectOnScreen(page: Page, target: Locator) {
  const box = (await target.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(view.width);
  expect(box.y + box.height).toBeLessThanOrEqual(view.height);
}

async function startEmptyWorkout(page: Page) {
  await page.goto("/workout");
  const start = page.getByRole("button", { name: "Start empty workout" });
  const name = page.getByRole("textbox", { name: "Workout name" });
  await expect(start.or(name)).toBeVisible({ timeout: 60_000 });
  if (await start.isVisible()) await start.click();
  await expect(name).toBeVisible(COLD);
}

/**
 * Discard workouts until none is active. Each test gets a fresh browser context (an empty local database) for the same user, so the
 * workouts earlier tests left on the server arrive by sync after this page loaded, and more than one can be active across devices.
 */
async function discardActiveWorkouts(page: Page) {
  const start = page.getByRole("button", { name: "Start empty workout" });
  const name = page.getByRole("textbox", { name: "Workout name" });
  for (let i = 0; i < 8; i++) {
    await expect(start.or(name)).toBeVisible(COLD);
    if (await start.isVisible()) {
      await page.waitForTimeout(2000); // a sync pull may still be bringing one in
      if (await start.isVisible()) return;
      continue;
    }
    await page.locator('summary[aria-label="Workout options"]').click();
    await page.getByRole("button", { name: "Discard workout" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Discard workout" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  }
  throw new Error("workouts kept coming back after being discarded");
}

/** Open the picker once so the catalog is in Dexie, then close it. */
async function waitForCatalog(page: Page) {
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await expect(page.getByRole("dialog").locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe("hints on the workout screen", () => {
  test.beforeEach(async ({ page }) => {
    await startEmptyWorkout(page);
  });

  test("the rest timer hint is a 44px target, opens on tap or hover, stays on screen and closes with Escape or an outside tap", async ({ page, isMobile }) => {
    const hint = page.getByRole("button", { name: "What is Rest timer?" });
    await expect(hint).toBeVisible();
    const box = (await hint.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    if (isMobile) {
      await hint.tap();
      const pop = page.getByRole("group", { name: "Rest timer" });
      await expect(pop).toBeVisible();
      await expect(pop).toContainText("Counts down your rest between sets");
      await expectOnScreen(page, pop);
      await expect(hint).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(pop).toBeHidden();
      await hint.tap();
      await expect(pop).toBeVisible();
      await page.getByRole("heading", { name: "How logging works" }).tap();
      await expect(pop).toBeHidden();
      // tapping the hint twice opens, then closes it
      await hint.tap();
      await expect(pop).toBeVisible();
      await hint.tap();
      await expect(pop).toBeHidden();
    } else {
      await hint.hover();
      const tip = page.getByRole("tooltip");
      await expect(tip).toBeVisible();
      await expect(tip).toContainText("Counts down your rest between sets");
      await page.mouse.move(5, 5);
      await expect(tip).toBeHidden();
      // keyboard focus shows it too
      await page.keyboard.press("Tab");
      await hint.focus();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toBeHidden();
    }
  });

  test("at 375px wide the popover stays inside the screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
    const hints = page.getByRole("button", { name: /^What is / });
    const count = await hints.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(count, 4); i++) {
      const hint = hints.nth(i);
      await hint.scrollIntoViewIfNeeded();
      await hint.click();
      const pop = page.locator("[id^='hint-']");
      await expect(pop).toBeVisible();
      await expectOnScreen(page, pop);
      await page.keyboard.press("Escape");
      await expect(pop).toBeHidden();
    }
  });

  test("the How logging works panel can be dismissed, reopened from the ? and stays away after a reload", async ({ page }) => {
    const panel = page.getByTestId("logging-guide");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Got it" }).click();
    await expect(panel).toBeHidden();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
    await expect(page.getByTestId("logging-guide")).toBeHidden();
    await page.getByRole("button", { name: "How logging works" }).click();
    await expect(page.getByTestId("logging-guide")).toBeVisible();
  });

  test("set rows carry a legend with hints for weight, effort, set type and last time", async ({ page }) => {
    await waitForCatalog(page);
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
    await picker.getByRole("button", { name: "Add Barbell Bench Press - Medium Grip", exact: true }).first().click();
    const block = page.getByRole("region", { name: "Barbell Bench Press - Medium Grip" });
    await expect(block).toBeVisible();
    for (const name of ["What is Total weight?", "What is Reps in reserve (RIR)?", "What is Set type?"]) {
      await expect(block.getByRole("button", { name })).toBeVisible();
    }
  });
});

test.describe("templates are easy to reach and use", () => {
  test("Templates is in the navbar (desktop) and in the More menu (mobile)", async ({ page, isMobile }) => {
    await page.goto("/today");
    if (isMobile) {
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Templates" }).click();
    } else {
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Templates" }).click();
    }
    await expect(page).toHaveURL(/\/templates$/, COLD);
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
  });

  test("create, edit, duplicate and start a template; /today lists it; a finished workout can be saved as one", async ({ page, isMobile }) => {
    await startEmptyWorkout(page);
    await waitForCatalog(page);
    // leave every open workout behind so templates can be started
    await discardActiveWorkouts(page);
    await expect.poll(async () => page.evaluate(() => document.querySelectorAll(".wk-active").length)).toBe(0);

    // create
    await page.goto("/templates");
    await page.getByRole("button", { name: "New template" }).first().click();
    await expect(page).toHaveURL(/\/templates\/[0-9a-f-]+$/, COLD);
    const name = page.getByLabel("Template name", { exact: true });
    await name.fill("UX push day");
    await name.blur();
    // edit: add an exercise and change the sets
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
    await picker.getByRole("button", { name: "Add Barbell Bench Press - Medium Grip", exact: true }).first().click();
    const line = page.getByRole("region", { name: "Barbell Bench Press - Medium Grip" });
    await expect(line).toBeVisible();
    await line.getByRole("textbox", { name: "Working sets" }).fill("4");
    // the editor's labels carry hints
    await expect(line.getByRole("button", { name: "What is Warm-up set?" })).toBeVisible();
    await expect(line.getByRole("button", { name: "What is Rest?" })).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(/\/templates$/);

    // duplicate
    await expect(page.getByRole("heading", { name: "UX push day" })).toBeVisible();
    await page.getByRole("button", { name: "Duplicate UX push day" }).click();
    await expect(page.getByRole("heading", { name: "UX push day (copy)" })).toBeVisible();

    // /today lists templates with Start and Edit
    await page.goto("/today");
    const card = page.getByRole("region", { name: "Your templates" });
    await expect(card).toBeVisible(COLD);
    await expect(card.getByRole("button", { name: "Start UX push day", exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: "Edit UX push day", exact: true })).toBeVisible();
    await expect(card.getByRole("link", { name: /All templates/ })).toHaveAttribute("href", "/templates");

    // start from /templates: the workout has the template's exercise and four sets
    await page.goto("/templates");
    await page.getByRole("button", { name: "Start UX push day", exact: true }).click();
    await expect(page).toHaveURL(/\/workout$/, COLD);
    const block = page.getByRole("region", { name: "Barbell Bench Press - Medium Grip" });
    await expect(block).toBeVisible(COLD);
    await expect(block.locator(".wk-set")).toHaveCount(4);

    // log a set and finish
    await logSetByTyping(block, 1, "60", "8", isMobile);
    await page.getByRole("button", { name: "Finish", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText(/checks it for personal records/)).toBeVisible();
    await sheet.getByRole("button", { name: "Finish workout" }).click();
    await expect(sheet.getByText("Workout saved")).toBeVisible();
    await sheet.getByRole("link", { name: "View in history" }).click();

    // Save as template from history
    await expect(page).toHaveURL(/\/history\/[0-9a-f-]+$/, COLD);
    await page.getByRole("button", { name: "Save as template" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Template name").fill("UX from history");
    await modal.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved")).toBeVisible();
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "UX from history" })).toBeVisible();
  });
});

test.describe("hints on the other pages", () => {
  for (const [path, heading] of [
    ["/today", "Today"],
    ["/history", "History"],
    ["/exercises", "Exercises"],
    ["/progress", "Progress"],
    ["/progress/body", "Body"],
    ["/progress/prs", "Records"],
    ["/insights", "Insights"],
    ["/templates", "Templates"],
    ["/settings/machines", null],
  ] as const) {
    test(`${path} has a page tip, and its first hint opens`, async ({ page }) => {
      // Tips show on a page's first visit only, and sign-up already landed on /today: forget the marks to see each first visit.
      await page.addInitScript(() => {
        for (const key of Object.keys(localStorage)) if (key.startsWith("overload:tip-seen:")) localStorage.removeItem(key);
      });
      await page.goto(path);
      if (heading) await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible(COLD);
      await expect(page.locator(".page-intro").first()).toBeVisible(COLD);
      const hint = page.getByRole("button", { name: /^What is / }).first();
      if (await hint.count()) {
        await hint.click();
        const pop = page.locator("[id^='hint-']");
        await expect(pop).toBeVisible();
        await expectOnScreen(page, pop);
      }
    });
  }

  test("a page tip shows on the first visit only: it is gone on the next", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.locator('.page-intro[data-tip="templates"]')).toBeVisible(COLD);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible(COLD);
    await expect(page.locator('.page-intro[data-tip="templates"]')).toBeHidden();
  });

  test("a dismissed page tip stays dismissed and Settings > Show tips brings it back", async ({ page }) => {
    await page.goto("/history");
    const tip = page.locator('.page-intro[data-tip="history"]');
    await expect(tip).toBeVisible(COLD);
    await tip.getByRole("button", { name: "Got it" }).click();
    await expect(tip).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible(COLD);
    await expect(tip).toBeHidden();
    await page.goto("/settings/profile");
    const toggle = page.getByLabel(/Show tips/);
    await toggle.uncheck();
    await toggle.check();
    await page.goto("/history");
    await expect(page.locator('.page-intro[data-tip="history"]')).toBeVisible(COLD);
  });
});

for (const theme of ["paper", "ink"] as const) {
  test.describe(`axe with a hint open, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    });
    for (const path of ["/today", "/templates", "/exercises", "/history", "/progress", "/insights", "/settings/profile", "/workout", "/learn/choosing-a-goal"]) {
      test(path, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", THEME_NAMES[theme]);
        await expect(page.locator("main").first()).toBeVisible(COLD);
        const hint = page.getByRole("button", { name: /^What is / }).first();
        if (await hint.count()) {
          await hint.click();
          await expect(page.locator("[id^='hint-']")).toBeVisible();
        }
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 4) }))).toEqual([]);
      });
    }
  });
}

test.describe("the lose-weight goal", () => {
  test("onboarding offers four goal cards and saves Lose weight", async ({ page, browser }) => {
    const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}` });
    const fresh = await context.newPage();
    void page;
    await createUserAtOnboarding(fresh, { tag: "goal", name: "Goal Tester" });
    await expect(fresh.getByRole("heading", { name: "Units and region" })).toBeVisible();
    await fresh.getByLabel("Kilograms").check();
    await fresh.getByLabel("Time zone").fill("America/Chicago");
    await fresh.getByRole("button", { name: "Next", exact: true }).click();
    await fresh.getByLabel("Male", { exact: true }).check();
    await fresh.getByLabel("Birth date").fill("1992-04-18");
    await fresh.getByLabel("Height (cm)").fill("178");
    await fresh.getByRole("button", { name: "Next", exact: true }).click();
    await expect(fresh.getByRole("heading", { name: "Training" })).toBeVisible();
    await fresh.getByLabel("Intermediate").check();
    const goals = fresh.getByRole("group", { name: "Main goal" });
    await expect(goals.getByRole("radio")).toHaveCount(4);
    for (const title of ["Build muscle", "Get stronger", "General fitness", "Lose weight"]) await expect(goals.getByText(title, { exact: true })).toBeVisible();
    await expect(goals.getByText(/0\.5 to 1% of bodyweight a week/)).toBeVisible();
    await expect(goals.getByRole("link", { name: "Compare the four goals" })).toHaveAttribute("href", "/learn/choosing-a-goal");
    await goals.getByRole("radio", { name: /Lose weight/ }).check();
    await fresh.getByRole("button", { name: "Next", exact: true }).click();
    await fresh.getByLabel(/^Bodyweight/).fill("90");
    await fresh.getByRole("button", { name: "Finish" }).click();
    await expect(fresh).toHaveURL(/\/today$/, COLD);
    await fresh.goto("/settings/profile");
    await expect(fresh.getByRole("radio", { name: /Lose weight/ })).toBeChecked();
    // switch goals any time
    await fresh.getByRole("radio", { name: /Get stronger/ }).check();
    await fresh.getByRole("button", { name: "Save profile" }).click();
    await expect(fresh.getByText("Saved.")).toBeVisible();
    await fresh.reload();
    await expect(fresh.getByRole("radio", { name: /Get stronger/ })).toBeChecked();
    await context.close();
  });

  test("the Choosing a goal article renders its comparison table and sources", async ({ page }) => {
    await page.goto("/learn/choosing-a-goal");
    await expect(page.getByRole("heading", { name: "Choosing a goal", level: 1 })).toBeVisible(COLD);
    const table = page.getByRole("table", { name: "What each training goal changes in Overload" });
    await expect(table).toBeVisible();
    await expect(table.getByRole("columnheader")).toHaveCount(5);
    await expect(table.getByRole("rowheader")).toHaveCount(8);
    await expect(page.getByRole("link", { name: /Helms 2014/ }).first()).toHaveAttribute("href", "https://doi.org/10.1186/1550-2783-11-20");
    await expect(page.getByText("Sources", { exact: true })).toBeVisible();
    await page.goto("/learn");
    await expect(page.getByRole("link", { name: /Choosing a goal/ })).toBeVisible();
  });
});

test("onboarding still works end to end with the card goal picker (Build muscle)", async ({ page, browser }) => {
  void page;
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}` });
  const fresh = await context.newPage();
  await createUserAtOnboarding(fresh, { tag: "goal2", name: "Goal Two" });
  await completeOnboarding(fresh);
  await context.close();
});
