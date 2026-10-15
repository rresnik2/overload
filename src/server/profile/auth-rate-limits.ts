// Pure data (kept out of auth.ts so it is unit-testable without booting Better Auth).
/**
 * Rate-limit rules per endpoint (per IP + path, stored in the `rateLimit` table). Production is strict; development and
 * tests (many sign-ups from one IP) get a high ceiling so the e2e suite does not trip them. A 429 carries
 * `X-Retry-After`, which the sign-in/up forms turn into a friendly message.
 */
export function authRateLimitRules(production: boolean) {
  const rule = (window: number, max: number) => (production ? { window, max } : { window, max: Math.max(max, 1000) });
  return {
    "/sign-in/email": rule(60, 10),
    "/sign-up/email": rule(600, 5),
    "/request-password-reset": rule(300, 3),
    "/reset-password": rule(300, 10),
    "/send-verification-email": rule(300, 3),
    "/passkey/*": rule(60, 20),
  };
}
