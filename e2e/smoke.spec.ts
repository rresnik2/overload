// Smoke checks that need no account. Sign-up, verification, onboarding and sign-in are covered end to end in e2e/auth.spec.ts.
import { expect, test } from "@playwright/test";

test("anonymous visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);
});

test("health endpoint answers", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
});
