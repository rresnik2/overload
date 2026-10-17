// Shared e2e user setup. Mandatory email verification and onboarding mean a usable account takes
// sign-up -> verification email (mocked inbox) -> link -> onboarding -> /today. Specs that just need a signed-in user call createUser().
// Production builds (E2E_PROD=1) have no mailbox endpoint and the real auth rate limits; see ./db.ts for how createUser() copes.
import { expect, type Page } from "@playwright/test";
import { linkTo, waitForEmail } from "../helpers/mailbox";
import { isProductionServer, markEmailVerified, resetAuthRateLimits } from "./db";

// The first hit on a route in `next dev` compiles it (and WebKit is slower still): allow it for the navigations this file waits on.
const COLD_ROUTE_MS = 30_000;

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
export const newPassword = () => `pw-${Math.random().toString(36).slice(2)}-Aa1!`;

export interface OnboardingOptions {
  unit?: "Kilograms" | "Pounds";
  weight?: string;
}

export interface CreateUserOptions extends OnboardingOptions {
  /** Prefix for the generated email address (default "e2e"). */
  tag?: string;
  /** Display name (default "E2E Tester"). */
  name?: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Production builds only: forget the per-IP auth counters so a spec's sign-ups and sign-ins never hit the real limits. No-op against `next dev`. */
export async function resetRateLimitsIfProduction(page: Page) {
  if (await isProductionServer(page.request)) await resetAuthRateLimits();
}

/** Submit the sign-up form and wait for the "check your inbox" screen. */
export async function signUpThroughForm(page: Page, email: string, password: string, name = "Auth Tester") {
  await resetRateLimitsIfProduction(page);
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await expect(page.getByText(`We sent a confirmation link to ${email}`)).toBeVisible();
}

/** Open the verification link from the mocked inbox. Verification signs the user in and /continue sends brand-new users to onboarding. */
export async function verifyEmail(page: Page, email: string) {
  const message = await waitForEmail(page.request, email, /confirm your overload email/i);
  await page.goto(linkTo(message, "/api/auth/verify-email"));
  await expect(page).toHaveURL(/\/onboarding$/, { timeout: COLD_ROUTE_MS });
}

export async function completeOnboarding(page: Page, opts: OnboardingOptions = {}) {
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
  await expect(page).toHaveURL(/\/today$/, { timeout: COLD_ROUTE_MS });
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
}

/**
 * Creates a verified user in `page`'s browser context and leaves the page on /onboarding, signed in (not yet onboarded).
 * Sign-up goes through the API (same rules as the form: the cookie jar is shared with `page`); verification uses the real UI.
 * Against a production build the verification link cannot be read, so the user is marked verified in the database and signs in instead.
 */
export async function createUserAtOnboarding(page: Page, opts: CreateUserOptions = {}): Promise<Credentials> {
  const email = uniqueEmail(opts.tag ?? "e2e");
  const password = newPassword();
  // Derived like playwright.config.ts does, so this also works from worker-scoped fixtures (which cannot read the test-scoped baseURL).
  const origin = new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;
  const production = await isProductionServer(page.request);
  const post = async (path: string, data: Record<string, unknown>) => {
    // Parallel workers share one IP and one set of counters. If another worker's request lands between our reset and our call and
    // pushes a production limit over the edge (429), or two workers create the counter row at once (500), reset and try again.
    for (let attempt = 0; ; attempt++) {
      if (production) await resetAuthRateLimits();
      const res = await page.request.post(`/api/auth/${path}`, { headers: { origin }, data });
      if ((res.status() === 429 || res.status() >= 500) && production && attempt < 3) continue;
      expect(res.ok(), `${path} responded ${res.status()}: ${await res.text()}`).toBe(true);
      return;
    }
  };

  await post("sign-up/email", { email, password, name: opts.name ?? "E2E Tester", callbackURL: "/continue" });
  if (production) {
    await markEmailVerified(email);
    await post("sign-in/email", { email, password });
    await page.goto("/continue");
    await expect(page).toHaveURL(/\/onboarding$/, { timeout: COLD_ROUTE_MS });
  } else {
    await verifyEmail(page, email);
  }
  return { email, password };
}

/** Creates a verified, onboarded user in `page`'s browser context and leaves the page on /today, signed in. */
export async function createUser(page: Page, opts: CreateUserOptions = {}): Promise<Credentials> {
  const creds = await createUserAtOnboarding(page, opts);
  await completeOnboarding(page, opts);
  return creds;
}
