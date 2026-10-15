import { describe, expect, it } from "vitest";
import { authRateLimitRules } from "./auth-rate-limits";

describe("authRateLimitRules", () => {
  const prod = authRateLimitRules(true);

  it("covers sign-in, sign-up, forgot-password, verification email and passkey endpoints", () => {
    for (const path of ["/sign-in/email", "/sign-up/email", "/request-password-reset", "/send-verification-email", "/passkey/*"]) {
      expect(prod).toHaveProperty([path]);
    }
  });

  it("is strict in production: slow endpoints allow a handful of tries per window", () => {
    expect(prod["/sign-up/email"]).toEqual({ window: 600, max: 5 });
    expect(prod["/request-password-reset"]).toEqual({ window: 300, max: 3 });
    expect(prod["/sign-in/email"].max).toBeLessThanOrEqual(10);
  });

  it("keeps the same windows but a high ceiling outside production (parallel e2e from one IP)", () => {
    const dev = authRateLimitRules(false);
    for (const key of Object.keys(prod) as (keyof typeof prod)[]) {
      expect(dev[key].window).toBe(prod[key].window);
      expect(dev[key].max).toBeGreaterThanOrEqual(1000);
    }
  });
});
