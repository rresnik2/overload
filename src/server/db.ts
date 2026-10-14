// The ONE place a Prisma client is constructed. Runtime uses the POOLED Neon URL (DATABASE_URL)
// through @prisma/adapter-pg; migrations use DIRECT_URL via prisma.config.ts.
//
// - globalThis singleton so dev HMR does not leak pools.
// - attachDatabasePool lets Vercel Fluid compute close idle connections before a function suspends.
// - The client is created lazily on first use, so importing this module (e.g. during `next build`
//   or in unit tests) never needs a database URL.
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { __overloadPrisma?: PrismaClient };

// `next build` evaluates route modules (Better Auth reads the client when it initializes) without any runtime
// secrets. The pool never connects until the first query, so a placeholder is safe for that phase only.
const BUILD_PLACEHOLDER_URL = "postgresql://build:build@localhost:5432/build";

function createClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? (process.env.NEXT_PHASE === "phase-production-build" ? BUILD_PLACEHOLDER_URL : undefined);
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");
  }
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  attachDatabasePool(pool);
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    // Keep transactions short on Neon; the sync transaction is the longest one.
    transactionOptions: { maxWait: 5_000, timeout: 15_000 },
  });
}

function getClient(): PrismaClient {
  return (globalForPrisma.__overloadPrisma ??= createClient());
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
