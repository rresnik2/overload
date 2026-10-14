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
const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
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
