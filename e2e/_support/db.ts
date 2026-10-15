// Test-only database access for production-build runs. `next start` has no mailbox endpoint (it answers 404 in production) and enforces the
// real auth rate limits (5 sign-ups per 10 minutes per IP), so there the helpers mark the e2e user verified directly and reset the counters.
// Only ever touches rows of the database in .env.local (the worktree's own Neon branch) and the throwaway users the specs create.
import type { APIRequestContext } from "@playwright/test";
import type { prisma } from "@/server/db";

type Prisma = typeof prisma;

let client: Promise<Prisma> | undefined;

function db(): Promise<Prisma> {
  client ??= (async () => {
    // Playwright does not load .env.local (`next dev/start` do). Take the database settings only: its other keys (an empty
    // E2E_BASE_URL, PORT, ...) must not leak into the spec process and change how baseURL is derived. Never overrides variables already set.
    const before = new Set(Object.keys(process.env));
    try {
      process.loadEnvFile(".env.local");
    } catch {
      /* CI sets DATABASE_URL in the environment */
    }
    for (const key of Object.keys(process.env)) {
      if (!before.has(key) && !/^DATABASE_(URL|POOL_MAX)$/.test(key)) delete process.env[key];
    }
    return (await import("@/server/db")).prisma;
  })();
  return client;
}

/** The worktree's database through the app's prisma client (for specs that assert what the server stored). */
export const testDb = db;

let production: Promise<boolean> | undefined;

/** True when the server under test is a production build: its mailbox endpoint is disabled. Probed once per worker. */
export function isProductionServer(request: APIRequestContext): Promise<boolean> {
  production ??= request.get("/api/auth/test-mailbox?to=probe@example.test").then((res) => res.status() === 404);
  return production;
}

export async function markEmailVerified(email: string): Promise<void> {
  const { count } = await (await db()).user.updateMany({ where: { email }, data: { emailVerified: true } });
  if (count !== 1) throw new Error(`Expected to verify exactly one user for ${email}, matched ${count}`);
}

/**
 * Better Auth keeps its per-IP counters in the `rateLimit` table. Zero them rather than deleting the rows: parallel workers create
 * rows on first use, and recreating them concurrently trips the unique key (a 500).
 */
export async function resetAuthRateLimits(): Promise<void> {
  await (await db()).rateLimit.updateMany({ data: { count: 0 } });
}
