// Swipe navigation on phones (DIAL part SWIPE): between exercises in a workout, between the three main tabs, and the edge swipe back
// of the installed iPhone app. Gestures are synthetic touch PointerEvents (e2e/_support/gestures.ts). Run on a production build:
//   PORT=3002 E2E_PROD=1 pnpm exec playwright test e2e/journeys/swipe.spec.ts --project=webkit-iphone --project=android-chrome
import { expect, test as base, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { releaseSwipe, swipe } from "../_support/gestures";
import { createUser } from "../_support/user";

type WorkerFixtures = { authState: Awaited<ReturnType<BrowserContext["storageState"]>> };
const test = base.extend<object, WorkerFixtures>({
  authState: [
    async ({ browser }, provide) => {
      const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await createUser(page, { tag: "swipe", name: "Swipe Tester" });
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
test.beforeEach(({ isMobile }) => {
  test.skip(!isMobile, "swipes are a phone feature");
});

const COLD = { timeout: 60_000 };
const navTypes = (page: Page) => page.locator("html").getAttribute("data-nav-types");

/** The slide types React handed the ViewTransition on the last navigation (left on <html> by PageTransition). */
async function expectNavType(page: Page, type: "nav-forward" | "nav-back") {
  await expect.poll(() => navTypes(page), { timeout: 10_000 }).toContain(type);
}

async function resetNavType(page: Page) {
  await page.evaluate(() => document.documentElement.removeAttribute("data-nav-types"));
}

async function settled(page: Page, ms = 600) {
  await page.waitForTimeout(ms);
}

test.describe("tab swipes", () => {
  test("swiping left then right walks Today, Exercises, Progress and back, with matching slide types and no wrap-around", async ({ page }) => {
    await page.goto("/today", COLD);
    const main = page.locator("#main");
    await expect(main).toHaveAttribute("data-swipe-tabs", "", COLD);
    await resetNavType(page);

    await swipe(main, { dx: -140, dy: 6 });
    await expect(page).toHaveURL(/\/exercises$/, COLD);
    await expectNavType(page, "nav-forward");

    await swipe(page.locator("#main"), { dx: -140 });
    await expect(page).toHaveURL(/\/progress$/, COLD);

    // The end of the ring: nothing happens.
    await swipe(page.locator("#main"), { dx: -140 });
    await settled(page);
    await expect(page).toHaveURL(/\/progress$/);

    await resetNavType(page);
    await swipe(page.locator("#main"), { dx: 140 });
    await expect(page).toHaveURL(/\/exercises$/, COLD);
    await expectNavType(page, "nav-back");

    await swipe(page.locator("#main"), { dx: 140 });
    await expect(page).toHaveURL(/\/today$/, COLD);

    // The other end: nothing happens either.
    await swipe(page.locator("#main"), { dx: 140 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("a short, slow drag does not navigate; a fast short flick does", async ({ page }) => {
    await page.goto("/today", COLD);
    const main = page.locator("#main");
    await expect(main).toHaveAttribute("data-swipe-tabs", "", COLD);
    await swipe(main, { dx: -40, ms: 700 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
    await swipe(main, { dx: -45, ms: 70, steps: 3 });
    await expect(page).toHaveURL(/\/exercises$/, COLD);
  });

  test("a vertical scroll never navigates, even with some sideways drift", async ({ page }) => {
    await page.goto("/today", COLD);
    const main = page.locator("#main");
    await expect(main).toHaveAttribute("data-swipe-tabs", "", COLD);
    await swipe(main, { dx: 18, dy: -260 });
    await swipe(main, { dx: -22, dy: 240 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
    // A diagonal that is more vertical than 1:1.5 is not a swipe either, however far it travels.
    await swipe(main, { dx: -150, dy: 120 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("a mouse never swipes", async ({ page }) => {
    await page.goto("/today", COLD);
    const main = page.locator("#main");
    await expect(main).toHaveAttribute("data-swipe-tabs", "", COLD);
    await swipe(main, { dx: -160, pointerType: "mouse" });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("a gesture that starts in a chart or a sideways scroller is left alone", async ({ page }) => {
    await page.goto("/today", COLD);
    await expect(page.locator("#main")).toHaveAttribute("data-swipe-tabs", "", COLD);
    const frame = page.locator("figure.chart-frame").first();
    await expect(frame).toBeVisible();
    await swipe(frame, { dx: -160 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("nested and More pages ignore the gesture", async ({ page }) => {
    for (const path of ["/history", "/settings/profile"]) {
      await page.goto(path, COLD);
      const main = page.locator("#main");
      await expect(main).not.toHaveAttribute("data-swipe-tabs", /.*/);
      await swipe(main, { dx: -160 });
      await swipe(main, { dx: 160 });
      await settled(page, 400);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
    }
  });

  test("dock taps slide by position, like a swipe", async ({ page }) => {
    await page.goto("/progress", COLD);
    const dock = page.getByRole("navigation", { name: "Primary (mobile)" });
    await resetNavType(page);
    await dock.getByRole("link", { name: "Exercises" }).click();
    await expect(page).toHaveURL(/\/exercises$/, COLD);
    await expectNavType(page, "nav-back");
    await resetNavType(page);
    await dock.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/progress$/, COLD);
    await expectNavType(page, "nav-forward");
  });

  test("browser back slides as nav-back", async ({ page }) => {
    await page.goto("/today", COLD);
    await page.getByRole("navigation", { name: "Primary (mobile)" }).getByRole("link", { name: "Exercises" }).click();
    await expect(page).toHaveURL(/\/exercises$/, COLD);
    await resetNavType(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/today$/, COLD);
    await expectNavType(page, "nav-back");
  });
});

test.describe("edge swipe back (installed iPhone app only)", () => {
  /** What the home-screen app reports: iOS plus navigator.standalone. */
  const standalone = async (page: Page) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    });
  };

  test("the page follows the finger, then goes back with nav-back", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "the installed-app gesture is iOS only");
    await standalone(page);
    await page.goto("/today", COLD);
    await page.getByRole("navigation", { name: "Primary (mobile)" }).getByRole("link", { name: "Exercises" }).click();
    await expect(page).toHaveURL(/\/exercises$/, COLD);
    await expect(page.locator("html")).toHaveAttribute("data-edge-back", "", COLD);
    await resetNavType(page);

    const html = page.locator("html");
    await swipe(html, { from: { x: 6, y: 300 }, dx: 150, hold: true });
    await expect(html).toHaveAttribute("data-edge-peek", "drag");
    const peek = await page.locator("#main").evaluate((el) => getComputedStyle(el).translate);
    expect(peek).toContain("150");
    await releaseSwipe(html);
    await expect(page).toHaveURL(/\/today$/, COLD);
    await expect(html).not.toHaveAttribute("data-edge-peek", /.*/);
    await expectNavType(page, "nav-back");
  });

  test("a short pull snaps back, a start away from the edge does nothing, and there is nothing to go back to on a fresh launch", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "the installed-app gesture is iOS only");
    await standalone(page);
    await page.goto("/today", COLD);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-edge-back", "", COLD);
    await page.getByRole("navigation", { name: "Primary (mobile)" }).getByRole("link", { name: "Exercises" }).click();
    await expect(page).toHaveURL(/\/exercises$/, COLD);

    await swipe(html, { from: { x: 6, y: 300 }, dx: 30, ms: 600 });
    await settled(page);
    await expect(page).toHaveURL(/\/exercises$/);
    await expect(html).not.toHaveAttribute("data-edge-peek", /.*/);

    await swipe(html, { from: { x: 120, y: 300 }, dx: 150 });
    await settled(page);
    await expect(page).toHaveURL(/\/exercises$/);

    // A fresh launch: one history entry, so there is nowhere to go.
    await page.goto("/today", COLD);
    await expect(html).toHaveAttribute("data-edge-back", "", COLD);
    const length = await page.evaluate(() => history.length);
    test.skip(length > 2, "the browser kept earlier entries; cannot test the empty history here");
    await swipe(html, { from: { x: 6, y: 300 }, dx: 150 });
    await settled(page);
    await expect(page).toHaveURL(/\/today$/);
  });

  test("outside an installed iPhone app the gesture is off", async ({ page }) => {
    await page.goto("/today", COLD);
    await expect(page.locator("#main")).toHaveAttribute("data-swipe-tabs", "", COLD);
    await expect(page.locator("html")).not.toHaveAttribute("data-edge-back", /.*/);
  });
});

test.describe("between exercises in a workout", () => {
  const A = "Barbell Bench Press - Medium Grip";
  const B = "Barbell Curl";
  const C = "Barbell Full Squat";

  async function addExercise(page: Page, search: string, name: string) {
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await picker.getByPlaceholder("Search exercises").fill(search);
    await picker.getByRole("button", { name: `Add ${name}`, exact: true }).first().click();
    await expect(page.getByRole("region", { name })).toBeVisible();
  }

  /** The name of the exercise that shows the dial panel. */
  const focusedName = (page: Page) => page.locator(".wk-exercise:has(li.wk-panel)").first().getAttribute("aria-label");

  async function startWith3(page: Page) {
    await page.goto("/workout", COLD);
    await page.getByRole("button", { name: "Start empty workout" }).click();
    await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
    await page.getByRole("button", { name: "Add exercise" }).first().click();
    await expect(page.getByRole("dialog").locator(".exercise-card").first()).toBeVisible(COLD); // catalog is in Dexie
    await page.keyboard.press("Escape");
    await addExercise(page, "barbell bench press", A);
    await addExercise(page, "barbell curl", B);
    await addExercise(page, "barbell full squat", C);
  }

  test("a swipe moves the dial panel through the exercises in order, the Prev/Next buttons do the same, and the ends do not wrap", async ({ page }) => {
    await startWith3(page);
    const area = page.locator(".wk-exercise").first();
    const switcher = page.getByRole("navigation", { name: "Switch exercise" });
    await expect(switcher.getByText("1 of 3")).toBeVisible();
    expect(await focusedName(page)).toBe(A);
    await expect(switcher.getByRole("button", { name: /^Previous exercise/ })).toBeDisabled();

    // Swipe right at the first exercise: nothing before it.
    await swipe(area, { dx: 140 });
    await page.waitForTimeout(400);
    expect(await focusedName(page)).toBe(A);

    await swipe(area, { dx: -140 });
    await expect(switcher.getByText("2 of 3")).toBeVisible();
    expect(await focusedName(page)).toBe(B);

    await swipe(page.getByRole("region", { name: B }), { dx: -140 });
    await expect(switcher.getByText("3 of 3")).toBeVisible();
    expect(await focusedName(page)).toBe(C);
    await expect(switcher.getByRole("button", { name: "Next exercise" })).toBeDisabled();

    // The end: no wrap.
    await swipe(page.getByRole("region", { name: C }), { dx: -140 });
    await page.waitForTimeout(400);
    expect(await focusedName(page)).toBe(C);

    await swipe(page.getByRole("region", { name: C }), { dx: 140 });
    await expect(switcher.getByText("2 of 3")).toBeVisible();

    // The buttons name their target and move by the same path.
    await switcher.getByRole("button", { name: `Previous exercise: ${A}` }).click();
    await expect(switcher.getByText("1 of 3")).toBeVisible();
    expect(await focusedName(page)).toBe(A);
    await switcher.getByRole("button", { name: `Next exercise: ${B}` }).click();
    expect(await focusedName(page)).toBe(B);
  });

  test("a vertical scroll, a drag on the dial or on the number strip never changes the exercise", async ({ page }) => {
    await startWith3(page);
    const area = page.locator(".wk-exercise").first();
    expect(await focusedName(page)).toBe(A);

    await swipe(area, { dx: -20, dy: -240 });
    await page.waitForTimeout(300);
    expect(await focusedName(page)).toBe(A);

    const dial: Locator = page.locator(".dial").first();
    await expect(dial).toBeVisible();
    await swipe(dial, { dx: -160 });
    await swipe(dial, { dx: 160 });
    const strip = page.locator(".numstrip").first();
    await expect(strip).toBeVisible();
    await swipe(strip, { dx: -160 });
    await swipe(strip, { dx: 160 });
    await page.waitForTimeout(400);
    expect(await focusedName(page)).toBe(A);
    await expect(page.getByRole("navigation", { name: "Switch exercise" }).getByText("1 of 3")).toBeVisible();
  });
});
