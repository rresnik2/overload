// Two people on one device (stream W3): A's local Dexie data, active workout and pending changes must never show up for B.
import { expect, test } from "@playwright/test";
import { newMember } from "./_pair";
import { resetRateLimitsIfProduction } from "../_support/user";

test.describe.configure({ timeout: 240_000 });

test("signing out and in as another user on the same browser shows none of the first user's data", async ({ browser }) => {
  const a = await newMember(browser, "dev-a");
  const page = a.page;

  // A starts a workout from /today, so there is an active workout and local rows on this device.
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page).toHaveURL(/\/workout$/, { timeout: 30_000 });
  await page.getByRole("textbox", { name: "Workout name" }).fill("A's private session");
  await page.goto("/today");
  await expect(page.getByRole("button", { name: "Resume workout" })).toBeVisible({ timeout: 30_000 });

  // Sign out through the UI.
  await page.goto("/settings/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in/);

  // B (an existing account) signs in on the same browser profile.
  const other = await newMember(browser, "dev-b");
  await resetRateLimitsIfProduction(page);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(other.email);
  await page.getByLabel("Password").fill(other.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 60_000 });

  await expect(page.getByRole("region", { name: "Start a workout" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Resume workout" })).toHaveCount(0);
  await page.goto("/workout");
  await expect(page.getByRole("textbox", { name: "Workout name" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 30_000 });
  await page.goto("/history");
  await expect(page.getByText("A's private session")).toHaveCount(0);
  expect(await page.content()).not.toContain("A's private session");
  await other.context.close();
  await a.context.close();
});
