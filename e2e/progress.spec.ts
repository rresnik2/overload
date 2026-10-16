// Stream F: progress charts, the machine-series picker, forecast / low-data states, the table fallbacks, the body page and the Navy
// calculator. The charts are read from the seeded demo user (`pnpm exec tsx prisma/seed/fixtures.ts`, demo@overload.test); the body
// form is exercised with a throwaway user from createUser() so the demo history is never edited.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createUser, resetRateLimitsIfProduction } from "./_support/user";
import { THEME_NAMES } from "@/lib/theme";

// Test-only credentials of the seeded demo account (prisma/seed/fixtures.ts). Never a real account.
const DEMO_EMAIL = "demo@overload.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";
const origin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;

// Fixture exercise ids (catalog UUIDv5 of the free-exercise-db ids, see src/lib/fixtures/exercises.ts).
const SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";
const LEG_PRESS = "cda4642e-23e8-5f6f-82b7-63f85195c232";
const LEG_CURL = "047f5403-8ded-54bf-ad56-5704abcc7393";
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

async function chartReady(page: Page, testId: string) {
  const frame = page.getByTestId(testId);
  await expect(frame).toBeVisible(COLD);
  await expect(frame.locator("svg.recharts-surface")).toBeVisible(COLD);
  return frame;
}

test.describe("progress (demo user)", () => {
  test.beforeEach(async ({ page }) => {
    await signInDemo(page);
  });

  test("overview: a card per series (two leg presses), weekly sets and the calendar", async ({ page }) => {
    await page.goto("/progress");
    await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible(COLD);
    const cards = page.getByTestId("series-cards").getByRole("link");
    await expect(cards.filter({ hasText: "Barbell Squat" })).toHaveCount(1);
    await expect(cards.filter({ hasText: "Leg Press" })).toHaveCount(2);
    await expect(page.getByTestId("weekly-sets").first()).toBeVisible();
    await expect(page.locator(".heatmap__cell")).toHaveCount(16 * 7);
    // no DOTS: the demo lifter has no deadlift, and machines never score
    await expect(page.getByText("DOTS", { exact: true })).toHaveCount(0);
  });

  test("a long series draws the dashed forecast with 50% and 80% bands", async ({ page }) => {
    await page.goto(`/progress/${SQUAT}`);
    const frame = await chartReady(page, "chart-e1rm");
    await expect(frame).toHaveAttribute("data-chart-state", "ready");
    await expect(frame.locator('path[stroke-dasharray="6 4"]')).toHaveCount(1);
    const bands = frame.locator(".recharts-area-area");
    await expect(bands).toHaveCount(2);
    const opacities = await bands.evaluateAll((els) => els.map((e) => e.getAttribute("fill-opacity")));
    expect(opacities.sort()).toEqual(["0.12", "0.22"]);
    await expect(frame.getByText("Forecast (median)")).toBeVisible();
    await expect(page.getByTestId("low-data")).toHaveCount(0);
    await expect(page.getByTestId("forecast-note")).toBeVisible();
    // percentile UI is hidden (no norms embedded) and the squat is not a machine
    await expect(page.getByTestId("percentile")).toHaveCount(0);
  });

  test("a short series shows 'Needs 6 sessions' and no forecast", async ({ page }) => {
    await page.goto(`/progress/${LEG_CURL}`);
    const frame = await chartReady(page, "chart-e1rm");
    await expect(frame).toHaveAttribute("data-chart-state", "low-data");
    await expect(page.getByTestId("low-data")).toContainText("Needs 6 sessions");
    await expect(frame.locator('path[stroke-dasharray="6 4"]')).toHaveCount(0);
    await expect(frame.locator(".recharts-area-area")).toHaveCount(0);
  });

  test("the two leg-press gyms are separate series in the picker", async ({ page }) => {
    await page.goto(`/progress/${LEG_PRESS}`);
    const picker = page.getByTestId("series-picker");
    await expect(picker.getByRole("link")).toHaveCount(2, COLD);
    const [first, second] = await picker.getByRole("link").evaluateAll((els) => els.map((e) => e.getAttribute("data-series-key")!));
    expect(first).not.toBe(second);
    const charts = page.locator(".progress-charts");
    await expect(charts).toHaveAttribute("data-series-key", first!);
    const firstSummary = await page.getByTestId("chart-e1rm").locator(".chart-frame__summary").innerText();
    await picker.locator(`[data-series-key="${second}"]`).click();
    await expect(page).toHaveURL(new RegExp(`series=${encodeURIComponent(second!).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), COLD);
    await expect(charts).toHaveAttribute("data-series-key", second!, COLD);
    const secondSummary = await page.getByTestId("chart-e1rm").locator(".chart-frame__summary").innerText();
    expect(secondSummary).not.toBe(firstSummary);
    await expect(picker.locator(`[data-series-key="${second}"]`)).toHaveAttribute("aria-current", "page");
  });

  test("every chart has a table fallback and an aria-describedby summary", async ({ page }) => {
    await page.goto(`/progress/${SQUAT}`);
    for (const id of ["chart-e1rm", "chart-topset", "chart-volume"]) {
      const frame = await chartReady(page, id);
      const plot = frame.locator('[role="img"]');
      const describedBy = await plot.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`[id="${describedBy}"]`)).not.toBeEmpty();
      await frame.getByText("View as table").click();
      const rows = frame.locator("table tbody tr");
      expect(await rows.count()).toBeGreaterThan(5);
    }
    await page.goto("/progress");
    await expect(page.getByTestId("weekly-sets").first()).toBeVisible(COLD);
    // "This week" is legitimately empty early in a week (the demo history depends on today's date): an empty frame shows a
    // status message instead of a plot. Every frame that does plot must have its table fallback and summary.
    for (const frame of await page.locator('figure.chart-frame[data-chart-state="empty"]').all()) {
      await expect(frame.getByRole("status")).not.toBeEmpty();
    }
    const plotted = page.locator('figure.chart-frame:not([data-chart-state="empty"])');
    expect(await plotted.count()).toBeGreaterThan(0);
    for (const frame of await plotted.all()) {
      await expect(frame.locator("details table")).toHaveCount(1);
      const describedBy = await frame.locator('[role="img"]').getAttribute("aria-describedby");
      await expect(page.locator(`[id="${describedBy}"]`)).not.toBeEmpty();
    }
  });

  test("records: separate boards per machine series", async ({ page }) => {
    await page.goto("/progress/prs");
    const board = page.getByTestId("pr-board");
    await expect(board).toBeVisible(COLD);
    await expect(board.getByRole("heading", { name: "Leg Press", level: 3 })).toHaveCount(2);
    await expect(board.getByRole("heading", { name: "Barbell Squat", level: 3 })).toHaveCount(1);
  });

  test("body page: trend, body fat with its method, FFMI as a range, circumferences", async ({ page }) => {
    await page.goto("/progress/body");
    await chartReady(page, "chart-weight");
    await chartReady(page, "chart-bodyfat");
    await expect(page.getByText(/Body fat \(Navy tape\)/)).toBeVisible();
    await expect(page.getByTestId("ffmi")).toContainText(/\d+\.\d–\d+\.\d/);
    await expect(page.getByTestId("circumferences")).toContainText("Waist");
  });

  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 900 }]) {
    test(`no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of ["/progress", `/progress/${SQUAT}`, `/progress/${LEG_PRESS}`, "/progress/body", "/progress/prs"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible(COLD);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });
  }

  for (const theme of ["paper", "ink"] as const) {
    test(`axe: progress pages have no violations in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
      for (const [path, ready] of [
        ["/progress", "weekly-sets"],
        [`/progress/${SQUAT}`, "chart-e1rm"],
        [`/progress/${LEG_CURL}`, "chart-e1rm"],
        [`/progress/${LEG_PRESS}`, "series-picker"],
        ["/progress/body", "chart-weight"],
        ["/progress/prs", "pr-board"],
      ] as const) {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", THEME_NAMES[theme]);
        await expect(page.getByTestId(ready).first()).toBeVisible(COLD);
        if (ready.startsWith("chart-")) await expect(page.getByTestId(ready).locator("svg.recharts-surface")).toBeVisible(COLD);
        // the mobile dock (stream B) has a known label-contrast issue: see change-requests/F-1-dock-active-label-contrast.md
        const results = await new AxeBuilder({ page }).exclude(".shell-dock").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        expect(results.violations.map((v) => ({ path, id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) })), path).toEqual([]);
      }
    });
  }
});

test.describe("body form (throwaway user)", () => {
  test("Navy tape calculator saves the measurement; the server owns the body-fat number; delete removes it", async ({ page }) => {
    await createUser(page, { tag: "body" });
    await page.goto("/progress/body");
    await expect(page.getByRole("heading", { name: "Body", level: 1 })).toBeVisible(COLD);
    // onboarding already logged the first weigh-in
    const history = page.getByTestId("body-history");
    await expect(history.locator("tbody tr")).toHaveCount(1, COLD);

    await page.getByLabel("Neck").fill("39");
    await page.getByLabel("Waist").fill("84");
    const estimate = page.getByTestId("navy-result");
    await expect(estimate).toBeVisible();
    const pct = Number.parseFloat((await estimate.innerText()).replace("%", ""));
    expect(pct).toBeGreaterThan(8);
    expect(pct).toBeLessThan(25);
    await page.getByRole("button", { name: "Use this estimate" }).click();
    await page.getByRole("textbox", { name: "Weight" }).fill("82.5");
    await page.getByRole("button", { name: "Save measurement" }).click();
    await expect(page.getByText("Measurement saved.")).toBeVisible(COLD);

    await expect(history.locator("tbody tr")).toHaveCount(2, COLD);
    await expect(history).toContainText("82.5");
    await expect(history).toContainText(`${pct}%`);
    await expect(history).toContainText("Navy tape");
    await chartReady(page, "chart-weight");
    await expect(page.getByText(/Body fat \(Navy tape\)/)).toBeVisible();
    await expect(page.getByTestId("circumferences")).toContainText("Waist");

    page.once("dialog", (d) => void d.accept());
    await history.getByRole("button", { name: /^Delete measurement/ }).first().click();
    await expect(page.getByText("Measurement deleted.")).toBeVisible(COLD);
    await expect(history.locator("tbody tr")).toHaveCount(1, COLD);
  });
});
