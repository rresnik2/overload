// Accessibility budget (stream W3): zero axe violations (WCAG 2.0/2.1 A + AA + best practices) on every key screen, in both themes.
// Screens already audited elsewhere: /progress/** (progress.spec.ts), /insights and /learn/* (insights.spec.ts), /styleguide (shell.spec.ts).
// Signed-in screens use the seeded demo user (`pnpm exec tsx prisma/seed/fixtures.ts`) for realistic data, plus throwaway users for the
// empty, onboarding and active-workout states.
import AxeBuilder from "@axe-core/playwright";
import { devices, expect, test, type Page } from "@playwright/test";
import { logSetByTyping } from "../_support/logging";
import { createUser, createUserAtOnboarding, resetRateLimitsIfProduction } from "../_support/user";
import { THEME_NAMES } from "@/lib/theme";

test.describe.configure({ timeout: 180_000 });

const DEMO_EMAIL = "demo@overload.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";
const SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";
const COLD = { timeout: 45_000 };
const THEMES = ["paper", "ink"] as const;
const origin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;

async function signInDemo(page: Page) {
  await resetRateLimitsIfProduction(page);
  for (let attempt = 0; ; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", { headers: { origin: origin() }, data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    if (res.ok()) return;
    if (attempt >= 3) throw new Error(`demo sign-in failed (${res.status()}): is the demo user seeded? Run: pnpm exec tsx prisma/seed/fixtures.ts`);
    await resetRateLimitsIfProduction(page);
  }
}

/** Violations found so far in this test: every screen is audited before the test fails, so one run lists everything to fix. */
const found: unknown[] = [];
test.afterEach(() => {
  const all = found.splice(0);
  expect(all).toEqual([]);
});

async function expectNoViolations(page: Page, label: string, theme: keyof typeof THEME_NAMES) {
  await expect(page.locator("html"), `theme attribute on ${label}`).toHaveAttribute("data-theme", THEME_NAMES[theme]);
  await page.waitForTimeout(300); // let entry transitions finish: axe reads mid-fade colours otherwise
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
  for (const v of results.violations) found.push({ screen: `${label} (${theme})`, id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) });
}

for (const theme of THEMES) {
  test.describe(`axe, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    });

    test("public and auth pages", async ({ page }) => {
      for (const [path, ready] of [
        ["/", "main"],
        ["/sign-in", "form"],
        ["/sign-up", "form"],
        ["/forgot-password", "form"],
        ["/learn", "main"],
        ["/~offline", "main"],
      ] as const) {
        await page.goto(path);
        await expect(page.locator(ready).first()).toBeVisible(COLD);
        await expectNoViolations(page, path, theme);
      }
    });

    test("signed in with data: today, library, history, templates, workout, settings", async ({ page }) => {
      await signInDemo(page);
      for (const [path, ready] of [
        ["/today", "Today"],
        ["/exercises", "Exercises"],
        [`/exercises/${SQUAT}`, null],
        ["/exercises/new", null],
        ["/history", "History"],
        ["/templates", "Templates"],
        ["/workout", null],
        ["/settings/profile", "Settings"],
        ["/settings/machines", "Settings"],
        ["/settings/security", "Settings"],
        ["/settings/account", "Settings"],
      ] as const) {
        await page.goto(path);
        if (ready) await expect(page.getByRole("heading", { name: ready, level: 1 })).toBeVisible(COLD);
        else await expect(page.locator("main")).toBeVisible(COLD);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        await expectNoViolations(page, path, theme);
      }
      // a history detail page: open the first workout from the list
      await page.goto("/history");
      await page.getByRole("article").first().getByRole("link").click();
      await expect(page.locator(".wk-set").first()).toBeVisible(COLD);
      await expectNoViolations(page, "/history/<id>", theme);
    });

    test("onboarding, an empty /today, and the active workout screen", async ({ page, isMobile }) => {
      await createUserAtOnboarding(page, { tag: "axe-onboard" });
      await expect(page.getByRole("heading", { name: "Units and region" })).toBeVisible(COLD);
      await expectNoViolations(page, "/onboarding", theme);

      // The second user gets the same device as this project, so a phone run audits the phone layout.
      const other = await page.context().browser()!.newContext(isMobile ? devices["iPhone 15"] : {});
      const fresh = await other.newPage();
      await fresh.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
      await createUser(fresh, { tag: "axe-fresh" });
      await expect(fresh.getByRole("region", { name: "Start a workout" })).toBeVisible(COLD);
      await expectNoViolations(fresh, "/today (empty)", theme);

      await fresh.getByRole("button", { name: "Start empty workout" }).click();
      await expect(fresh.getByRole("textbox", { name: "Workout name" })).toBeVisible(COLD);
      await expectNoViolations(fresh, "/workout (no exercises)", theme);
      await fresh.getByRole("button", { name: "Add exercise" }).first().click();
      const picker = fresh.getByRole("dialog");
      await expect(picker.locator(".exercise-card").first()).toBeVisible(COLD);
      await expectNoViolations(fresh, "/workout exercise picker", theme);
      await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
      await picker.getByRole("button", { name: /^Add Barbell Bench Press(?!.* to favorites)/ }).first().click(); // not the row's star ("Add <name> to favorites")
      await expect(fresh.getByRole("region", { name: /Barbell Bench Press/ })).toBeVisible(COLD);
      const block = fresh.getByRole("region", { name: /Barbell Bench Press/ });
      await logSetByTyping(block, 1, "60", "8", isMobile);
      await expect(fresh.getByTestId("rest-clock")).toBeVisible(COLD);
      await expectNoViolations(fresh, "/workout (set logged, rest timer running)", theme);
      await other.close();
    });
  });
}
