// Better Auth server instance. Phase 0 ships MINIMAL email + password; stream A owns everything
// in this file from Wave 1 (Resend verification/reset emails, Google, passkey UX, rate-limit rules).
//
// The plugin/provider LIST here is what the Better Auth CLI reads to generate the auth tables
// (`pnpm auth:generate`); the tables are already in prisma/schema.prisma and frozen.
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
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
    // Stream A turns verification on once Resend is wired (docs/agents/A.md).
    requireEmailVerification: false,
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
  },
  // Serverless: in-memory rate limiting does not work across instances. Stored in the `rateLimit` table.
  rateLimit: { enabled: true, storage: "database" },
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
