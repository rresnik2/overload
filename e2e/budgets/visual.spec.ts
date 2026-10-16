// Visual snapshots (stream W3): the key screens at 375px (iPhone) and 1280px (desktop) in both themes. Chromium only: WebKit has its
// own axe, console and journey coverage, and one engine keeps the baselines reviewable. Baselines are per platform
// (e2e/budgets/visual.spec.ts-snapshots/*-chromium-<os>.png); regenerate with `--update-snapshots` on a new OS (CI is Linux).
// Only screens whose content does not depend on today's date: the demo user's charts are covered by progress.spec.ts instead.
import { expect, test, type Page } from "@playwright/test";
import { ARTICLES } from "@/components/learn/articles";
import { completeOnboarding, createUserAtOnboarding } from "../_support/user";

test.describe.configure({ timeout: 240_000 });

// 375px is a tall viewport rather than a full-page capture: the bottom dock is position: fixed and would float mid-page otherwise.
const VIEWPORTS = { "375": { width: 375, height: 1100 }, "1280": { width: 1280, height: 800 } } as const;
const THEMES = ["paper", "ink"] as const;
const COLD = { timeout: 45_000 };

async function shoot(page: Page, name: string) {
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  await expect(page.locator("main").first()).toBeVisible(COLD);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: wide,
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.01,
    // remote exercise photos and the live clock are not part of the layout under test
    mask: [page.locator(".exercise-card__photo"), page.locator(".sync-pip")],
  });
}

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test.describe(`${vpName}px ${theme}`, () => {
      test.use({ viewport, reducedMotion: "reduce" });

      test("public and auth screens", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "chromium-only baselines");
        await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
        const first = ARTICLES[0]?.slug;
        for (const [name, path] of [
          ["landing", "/"],
          ["sign-in", "/sign-in"],
          ["sign-up", "/sign-up"],
          ["forgot-password", "/forgot-password"],
          ["learn-index", "/learn"],
          ...(first ? ([["learn-article", `/learn/${first}`]] as const) : []),
          ["offline", "/~offline"],
          ["styleguide", "/styleguide"],
        ] as const) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("data-theme", `overload-${theme}`);
          await shoot(page, `${name}-${vpName}-${theme}`);
        }
      });

      test("signed-in screens for a brand-new user", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "chromium-only baselines");
        await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
        await createUserAtOnboarding(page, { tag: "visual", name: "Visual Tester" });
        await expect(page.getByRole("heading", { name: "Units and region" })).toBeVisible(COLD);
        await shoot(page, `onboarding-${vpName}-${theme}`);
        await completeOnboarding(page);
        for (const [name, path] of [
          ["today-empty", "/today"],
          ["workout-idle", "/workout"],
          ["exercises", "/exercises"],
          ["history-empty", "/history"],
          ["templates-empty", "/templates"],
          ["progress-empty", "/progress"],
          ["insights-empty", "/insights"],
          ["settings-profile", "/settings/profile"],
          ["settings-security", "/settings/security"],
        ] as const) {
          await page.goto(path);
          await expect(page.locator("html")).toHaveAttribute("data-theme", `overload-${theme}`);
          await shoot(page, `${name}-${vpName}-${theme}`);
        }
      });
    });
  }
}
