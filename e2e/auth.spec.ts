// Stream A end-to-end: sign up -> verify through the mocked inbox -> onboarding -> /today; sign in; password reset;
// and the injected-userId check on the profile Server Action.
// Needs the dev server on PORT with an empty RESEND_API_KEY (or any *.test address, which never leaves the outbox).
import { expect, test, type Browser } from "@playwright/test";
import { linkTo, waitForEmail } from "./helpers/mailbox";
import { isProductionServer } from "./_support/db";
import { completeOnboarding, createUser, newPassword, resetRateLimitsIfProduction, signUpThroughForm, uniqueEmail, verifyEmail } from "./_support/user";

// Multi-step flows against a dev server that compiles routes on first hit (WebKit is the slowest).
test.describe.configure({ timeout: 90_000 });

// Production builds enforce the real auth rate limits (10 sign-ins a minute per IP); every test starts with fresh counters.
test.beforeEach(({ page }) => resetRateLimitsIfProduction(page));

const MAILBOX_SKIP = "reads the mocked inbox, which a production build does not expose (covered by the `next dev` run)";

test("anonymous visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fprofile/);
});

test("sign up, verify by email, onboard, land on /today, then sign out and in again", async ({ page, context }) => {
  test.skip(await isProductionServer(page.request), MAILBOX_SKIP);
  const email = uniqueEmail("flow");
  const password = newPassword();
  await signUpThroughForm(page, email, password);
  await verifyEmail(page, email);
  await completeOnboarding(page);

  // Settings reflect what onboarding wrote.
  await page.goto("/settings/profile");
  await expect(page.getByLabel("Time zone")).toHaveValue("America/Chicago");
  await expect(page.getByLabel("Height (cm)")).toHaveValue("178");
  await expect(page.getByLabel("Experience")).toHaveValue("INTERMEDIATE");

  await context.clearCookies();
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 30_000 });
});

test("sign-in before verification asks for the email link", async ({ page }) => {
  const email = uniqueEmail("unverified");
  const password = newPassword();
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/verify-email/);
});

test("password reset through the mocked inbox", async ({ page, context }) => {
  test.skip(await isProductionServer(page.request), MAILBOX_SKIP);
  const { email, password } = await createUser(page, { tag: "reset", name: "Auth Tester" });
  await context.clearCookies();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

  const message = await waitForEmail(page.request, email, /reset your overload password/i);
  await page.goto(linkTo(message, "/api/auth/reset-password"));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  const fresh = newPassword();
  await page.getByLabel("New password", { exact: true }).fill(fresh);
  await page.getByLabel("Confirm new password").fill(fresh);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/sign-in\?reset=1/);

  // The old password no longer works; the new one does.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Sign in" }).getByRole("alert")).toContainText(/do not match/i);
  await page.getByLabel("Password").fill(fresh);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/, { timeout: 30_000 });
});

async function newOnboardedUser(browser: Browser, tag: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { email, password } = await createUser(page, { tag, name: tag });
  return { context, page, email, password };
}

test("a userId injected into the profile action is rejected and never touches another user", async ({ browser }) => {
  const victim = await newOnboardedUser(browser, "victim");
  const attacker = await newOnboardedUser(browser, "attacker");

  // Learn the victim's user id from the account export (their own session), so the injection targets a real row.
  const exportRes = await victim.page.request.get("/settings/account/export");
  expect(exportRes.ok()).toBe(true);
  const exported = (await exportRes.json()) as Record<string, unknown>;
  const exportText = JSON.stringify(exported);
  expect(exportText).not.toMatch(/"userId"/);
  expect(exportText).not.toMatch(/"(password|accessToken|refreshToken|idToken|token|publicKey|credentialID)"\s*:/);
  expect(exported.profile).toMatchObject({ timezone: "America/Chicago", unitPreference: "KG" });

  // Capture the real Server Action request the attacker's profile form sends, then replay it with extra fields.
  await attacker.page.goto("/settings/profile");
  const captured = attacker.page.waitForRequest((req) => req.method() === "POST" && Boolean(req.headers()["next-action"]));
  await attacker.page.getByLabel("Default rest (seconds)").fill("90");
  await attacker.page.getByRole("button", { name: "Save profile" }).click();
  const request = await captured;
  await expect(attacker.page.getByText("Saved.")).toBeVisible();

  const body = JSON.parse(request.postData() ?? "[]") as [Record<string, unknown>];
  expect(body[0]).toMatchObject({ defaultRestSec: 90 });
  const headers = request.headers();
  const replay = (payload: Record<string, unknown>) =>
    attacker.page.request.post(request.url(), {
      headers: { "content-type": headers["content-type"] ?? "text/plain;charset=UTF-8", "next-action": headers["next-action"] ?? "", accept: headers["accept"] ?? "text/x-component" },
      data: JSON.stringify([payload]),
    });

  const injected = await replay({ ...body[0], defaultRestSec: 5, userId: "someone-else", timezone: "Asia/Tokyo" });
  expect(injected.ok()).toBe(true);
  expect(await injected.text()).toContain('"ok":false'); // strict schema: unknown key `userId` -> rejected, nothing written

  // Nothing changed for the attacker either (the rejected request wrote nothing) ...
  await attacker.page.reload();
  await expect(attacker.page.getByLabel("Default rest (seconds)")).toHaveValue("90");
  await expect(attacker.page.getByLabel("Time zone")).toHaveValue("America/Chicago");

  // ... and the victim's profile is untouched.
  await victim.page.goto("/settings/profile");
  await expect(victim.page.getByLabel("Default rest (seconds)")).toHaveValue("120");
  await expect(victim.page.getByLabel("Time zone")).toHaveValue("America/Chicago");

  await victim.context.close();
  await attacker.context.close();
});

// auth.session.cookieCache (src/server/auth/auth.ts) lets a device skip the session lookup for up to 5 minutes. On THIS device sign-out,
// "sign out other devices" and a password change must still behave at once; the other device's DB session is gone immediately and its
// cached snapshot lapses within the window. The specs below check this device and the database truth (disableCookieCache).
const appOrigin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;

test("sign-out ends this device's session at once, cookie cache included", async ({ browser }) => {
  const user = await newOnboardedUser(browser, "signout");
  const { page, context } = user;
  await page.goto("/today"); // warms the cached snapshot cookie
  await page.goto("/settings/profile");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });
  const names = (await context.cookies()).map((c) => c.name);
  expect(names.filter((n) => n.includes("session"))).toEqual([]);
  await page.goto("/today");
  await expect(page).toHaveURL(/\/sign-in/);
  await context.close();
});

test("sign out other devices and a password change keep this device signed in and end the other session", async ({ browser }) => {
  const mine = await newOnboardedUser(browser, "devices");
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await resetRateLimitsIfProduction(other);
  const signIn = await other.request.post("/api/auth/sign-in/email", { headers: { origin: appOrigin() }, data: { email: mine.email, password: mine.password } });
  expect(signIn.ok()).toBe(true);
  expect(await (await other.request.get("/api/auth/get-session?disableCookieCache=true")).json()).not.toBeNull();

  await mine.page.goto("/settings/security");
  const sessions = mine.page.getByRole("list", { name: "Active sessions" }).getByRole("listitem");
  await expect(sessions).toHaveCount(2, { timeout: 30_000 });
  await mine.page.getByRole("button", { name: "Sign out all other devices" }).click();
  await expect(sessions).toHaveCount(1, { timeout: 30_000 });

  // This device is still signed in, and the other one is gone in the database (the check that skips the cookie cache).
  await mine.page.goto("/today");
  await expect(mine.page).toHaveURL(/\/today$/);
  expect(await (await other.request.get("/api/auth/get-session?disableCookieCache=true")).json()).toBeNull();

  // Changing the password revokes other sessions too and also keeps this device signed in.
  const again = await other.request.post("/api/auth/sign-in/email", { headers: { origin: appOrigin() }, data: { email: mine.email, password: mine.password } });
  expect(again.ok()).toBe(true);
  await mine.page.goto("/settings/security");
  const form = mine.page.getByRole("form", { name: "Change password" });
  const fresh = newPassword();
  await form.getByLabel("Current password").fill(mine.password);
  await form.getByLabel("New password", { exact: true }).fill(fresh);
  await form.getByLabel("Confirm new password").fill(fresh);
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(mine.page.getByText("Password changed. Other devices were signed out.")).toBeVisible({ timeout: 30_000 });
  await mine.page.goto("/today");
  await expect(mine.page).toHaveURL(/\/today$/);
  expect(await (await other.request.get("/api/auth/get-session?disableCookieCache=true")).json()).toBeNull();

  await otherContext.close();
  await mine.context.close();
});

test("account deletion needs the typed phrase and the password, then removes the user", async ({ browser }) => {
  const user = await newOnboardedUser(browser, "doomed");
  const { page } = user;
  await page.goto("/settings/account");
  const form = page.getByRole("form", { name: "Delete account" });

  await form.getByLabel(/Type "delete my account"/).fill("nope");
  await form.getByLabel("Password").fill(user.password);
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(form.getByRole("alert").first()).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/account/);

  await form.getByLabel(/Type "delete my account"/).fill("delete my account");
  await form.getByLabel("Password").fill("not-the-password-1");
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(form.getByText("That password is not correct").first()).toBeVisible();

  await form.getByLabel("Password").fill(user.password);
  await form.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/sign-in\?deleted=1/);

  // The session is gone and so are the credentials.
  await page.goto("/settings/account");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("form", { name: "Sign in" }).getByRole("alert")).toContainText(/do not match/i);
  await user.context.close();
});
