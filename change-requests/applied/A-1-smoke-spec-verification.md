# A-1: update `e2e/smoke.spec.ts` for mandatory email verification

## What
`e2e/smoke.spec.ts` (frozen) test 2, "sign up, reach the stub app page, sign out and sign in again", must replace its
sign-up steps. After this branch, `emailAndPassword.requireEmailVerification` is `true`, so sign-up ends on
`/verify-email`, not `/today`, and new users go through onboarding. Replace lines 10-24 (sign-up through the first
`/today` assertion) with:

```ts
import { linkTo, waitForEmail } from "./helpers/mailbox"; // owned by stream A, already on this branch

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Smoke Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  const mail = await waitForEmail(page.request, email, /confirm your overload email/i);
  await page.goto(linkTo(mail, "/api/auth/verify-email")); // signs in and lands on /onboarding
  await expect(page).toHaveURL(/\/onboarding$/);
```

and then complete onboarding (see `completeOnboarding()` in `e2e/auth.spec.ts`) before the `/today` assertions. The
later sign-out / sign-in half of the test is unchanged: signing in again lands on `/today` once onboarded.
`e2e/auth.spec.ts` already covers the complete flow, so this is also fine to delete from the smoke spec and keep only
"anonymous visitors are sent to sign-in" and "health endpoint answers".

## Why
Email verification is a Wave 1 requirement for stream A (docs/agents/A.md). The smoke spec's old path (sign-up
immediately signed in) can no longer happen, so the spec fails by design (`pnpm exec playwright test e2e/smoke.spec.ts`:
2 pass, 1 fail with `Received: /verify-email?...`).

## Workaround
None needed for stream A: `e2e/auth.spec.ts` covers sign up -> verify -> onboarding -> /today, sign in and password
reset. Until this lands, the smoke spec's sign-up test fails; the other two smoke tests pass.
