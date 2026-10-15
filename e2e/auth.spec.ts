// Stream A end-to-end: sign up -> verify through the mocked inbox -> onboarding -> /today; sign in; password reset;
// and the injected-userId check on the profile Server Action.
// Needs the dev server on PORT with an empty RESEND_API_KEY (or any *.test address, which never leaves the outbox).
import { expect, test, type Browser, type Page } from "@playwright/test";
import { linkTo, waitForEmail } from "./helpers/mailbox";

const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
const newPassword = () => `pw-${Math.random().toString(36).slice(2)}-Aa1!`;

async function signUpAndVerify(page: Page, email: string, password: string, name = "Auth Tester") {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();

  const message = await waitForEmail(page.request, email, /confirm your overload email/i);
  await page.goto(linkTo(message, "/api/auth/verify-email"));
  // Verification signs the user in and /continue sends brand-new users to onboarding.
  await expect(page).toHaveURL(/\/onboarding$/);
}

async function completeOnboarding(page: Page, opts: { unit?: "Kilograms" | "Pounds"; weight?: string } = {}) {
  const unit = opts.unit ?? "Kilograms";
  await expect(page.getByRole("heading", { name: "Units and region" })).toBeVisible();
  await page.getByLabel(unit).check();
  await page.getByLabel("Time zone").fill("America/Chicago");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await page.getByLabel("Male", { exact: true }).check();
  await page.getByLabel("Birth date").fill("1992-04-18");
  if (unit === "Pounds") {
    await page.getByLabel("Height (ft)").fill("5");
    await page.getByLabel("Height (in)").fill("10");
  } else {
    await page.getByLabel("Height (cm)").fill("178");
  }
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Training" })).toBeVisible();
  await page.getByLabel("Intermediate").check();
  await page.getByLabel("Build muscle").check();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Starting point" })).toBeVisible();
  await page.getByLabel(/^Bodyweight/).fill(opts.weight ?? "82.5");
  await page.getByLabel(/Body fat/).fill("16");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

test("anonymous visitors are sent to sign-in", async ({ page }) => {
  await page.goto("/settings/profile");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings%2Fprofile/);
});

test("sign up, verify by email, onboard, land on /today, then sign out and in again", async ({ page, context }) => {
  const email = uniqueEmail("flow");
  const password = newPassword();
  await signUpAndVerify(page, email, password);
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
  await expect(page).toHaveURL(/\/today$/);
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
  const email = uniqueEmail("reset");
  const password = newPassword();
  await signUpAndVerify(page, email, password);
  await completeOnboarding(page);
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
  await expect(page).toHaveURL(/\/today$/);
});

async function newOnboardedUser(browser: Browser, tag: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(tag);
  const password = newPassword();
  await signUpAndVerify(page, email, password, tag);
  await completeOnboarding(page);
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
