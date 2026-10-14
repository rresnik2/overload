// Phase 0 smoke test (needs a database: DATABASE_URL/DIRECT_URL in .env.local, migrated). Stream A's full flows live in e2e/auth.spec.ts.
// Test credentials are generated here for this local run only; nothing is read from the owner's accounts.
import { expect, test } from "@playwright/test";

test("anonymous visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);
});

test("sign up, reach the stub app page, sign out and sign in again", async ({ page, context }) => {
  const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Smoke Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await context.clearCookies();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("health endpoint answers", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
});
