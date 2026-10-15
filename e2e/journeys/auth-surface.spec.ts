// Sign-in surface: the passkey button is always offered; the Google button appears exactly when Google is configured on the server.
// (The OAuth round trip and the WebAuthn ceremony need a real Google account / authenticator: PENDING on the owner, see docs/deploy.md.)
import { expect, test } from "@playwright/test";

test("sign-in offers email, a passkey button and (when configured) Google; sign-up offers Google too", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
  const google = page.getByRole("button", { name: "Continue with Google" });
  const configured = (await google.count()) > 0;
  test.info().annotations.push({ type: "google", description: configured ? "configured" : "not configured on this server" });
  if (configured) {
    await expect(google).toBeEnabled();
    await page.goto("/sign-up");
    await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
  }
  // The email field advertises passkey autofill (conditional UI).
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", /webauthn/);
});

test("forgot-password page is reachable from sign-in and never reveals whether an address exists", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: /forgot/i }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();
});
