// /today: the composed home screen. A brand-new user sees invitations, not blank charts; starting a workout hands over to /workout.
// No date-dependent assertions: "this week" can legitimately be empty for the demo history.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createUser } from "./_support/user";

test.describe.configure({ timeout: 120_000 });

test("a brand-new user sees an empty state on every card and can start a workout", async ({ page }) => {
  await createUser(page, { tag: "today", name: "Today Tester" });
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Start a workout" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No sets this week yet")).toBeVisible();
  await expect(page.getByText("No weigh-ins yet").or(page.getByRole("region", { name: "Bodyweight trend" }))).toBeVisible();
  await expect(page.getByText("Your first weekly review appears after a week of logged training.")).toBeVisible();

  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page).toHaveURL(/\/workout$/, { timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible({ timeout: 30_000 });

  // Back on /today the card offers to resume it.
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Resume workout" })).toBeVisible({ timeout: 30_000 });
});

for (const theme of ["paper", "ink"] as const) {
  test(`axe: /today has no violations in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    await createUser(page, { tag: "today-axe" });
    await page.goto("/today");
    await expect(page.getByRole("region", { name: "Start a workout" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-theme", `overload-${theme}`);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
