// Better Auth server instance (stream A): email + password with verification and reset through Resend, optional Google,
// passkeys, database-backed rate limits, 30-day sessions.
//
// The plugin/provider LIST here is what the Better Auth CLI reads to generate the auth tables
// (`pnpm auth:generate`); the tables are already in prisma/schema.prisma and frozen.
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { waitUntil } from "@vercel/functions";
import { resolveAppUrl } from "@/lib/app-url";
import { prisma } from "@/server/db";
import { sendEmail } from "@/server/email/send";
import { passwordResetEmail, verificationEmail } from "@/server/email/templates";
import { authRateLimitRules } from "@/server/profile/auth-rate-limits";

const baseURL = resolveAppUrl();
// `next build` evaluates this module without runtime secrets; Better Auth refuses a missing secret in production,
// so give the BUILD phase (only) a throwaway value. At runtime a missing BETTER_AUTH_SECRET still fails loudly.
const secret =
  process.env.BETTER_AUTH_SECRET ??
  (process.env.NEXT_PHASE === "phase-production-build" ? "build-phase-placeholder-secret-not-used-at-runtime" : undefined);
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  baseURL,
  secret,
  // Dev worktrees run on ports 3000-3005; accept any of them as an origin (production: only the configured origin).
  trustedOrigins:
    process.env.NODE_ENV === "production" ? [baseURL] : [baseURL, ...[3000, 3001, 3002, 3003, 3004, 3005].map((p) => `http://localhost:${p}`)],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited (response timing must not reveal whether the address exists); waitUntil keeps it alive on Vercel.
      waitUntil(
        sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name, url }) }).catch((error) =>
          console.error("[auth] password reset email failed", error instanceof Error ? error.message : error),
        ),
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      waitUntil(
        sendEmail({ to: user.email, ...verificationEmail({ name: user.name, url }) }).catch((error) =>
          console.error("[auth] verification email failed", error instanceof Error ? error.message : error),
        ),
      );
    },
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
      }
    : {},
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh once a day
    // Signed session snapshot in a cookie, so server renders and /api/sync skip the session + user queries (two Neon round
    // trips on every navigation) for up to `maxAge` seconds. TRADE-OFF: a session revoked from another device ("sign out other
    // sessions", a password change with revokeOtherSessions, account deletion) stays valid on a device that still holds an
    // unexpired snapshot, for at most `maxAge` (5 minutes). On THIS device sign-out clears the cookie at once, and
    // `disableCookieCache` forces a database read where it matters. The snapshot is also what shows the name in the avatar.
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  // Serverless: in-memory rate limiting does not work across instances. Stored in the `rateLimit` table.
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: authRateLimitRules(process.env.NODE_ENV === "production"),
  },
  plugins: [
    passkey({
      rpID: process.env.PASSKEY_RP_ID ?? new URL(baseURL).hostname,
      rpName: process.env.PASSKEY_RP_NAME ?? "Overload",
      origin: baseURL,
    }),
    nextCookies(), // must stay LAST
  ],
});

export type Auth = typeof auth;
