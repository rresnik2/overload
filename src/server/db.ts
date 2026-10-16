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
import { measureQuery, serverTimingEnabled } from "@/server/perf/server-timing";

const globalForPrisma = globalThis as unknown as { __overloadPrisma?: PrismaClient };

// `next build` evaluates route modules (Better Auth reads the client when it initializes) without any runtime
// secrets. The pool never connects until the first query, so a placeholder is safe for that phase only.
const ON_VERCEL = Boolean(process.env.VERCEL);

const BUILD_PLACEHOLDER_URL = "postgresql://build:build@localhost:5432/build";

function createClient(): PrismaClient {
  const connectionString =
    process.env.DATABASE_URL ?? (process.env.NEXT_PHASE === "phase-production-build" ? BUILD_PLACEHOLDER_URL : undefined);
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (copy .env.example to .env.local)");
  }
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Keep connections warm between taps: every reconnect to Neon costs DNS + TCP + TLS + auth (several round trips), and the pg
    // default drops idle clients after 10 s. A long-lived server (local, LAN, `next start`) holds one for 5 minutes. There is
    // deliberately NO minimum idle connection (`min` stays 0): an open connection can keep Neon's compute awake, which spends
    // compute hours, so after 5 idle minutes the pool empties and Neon may suspend. On Vercel the pool stays at the 10 s default: `attachDatabasePool` below
    // holds the function alive for `idleTimeoutMillis` after every release so Fluid compute can close idle sockets before it
    // suspends, so a 5-minute timeout there would pin every invocation for 5 minutes.
    idleTimeoutMillis: ON_VERCEL ? 10_000 : 300_000,
    // TCP keep-alive lets the OS notice a peer that vanished (Neon suspended the compute, the laptop slept) instead of waiting forever.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // Never wait forever for a connection or an answer. A socket that died silently used to hang a request for minutes (an
    // `/exercises` request once hung for 914 s after Neon P1017 ConnectionClosed). pg-pool discards a client whose query errored,
    // so the retry after the timeout gets a fresh connection.
    connectionTimeoutMillis: 15_000,
    query_timeout: 30_000,
  });
  // Neon closes idle connections (compute scale-to-zero, restarts). pg-pool has already removed the dead client from the pool when
  // it emits this; without a listener Node would treat the event as an uncaught exception.
  pool.on("error", (error) => {
    console.warn("[db] idle connection closed, it will be replaced on the next query:", error.message);
  });
  attachDatabasePool(pool);
  const options = {
    adapter: new PrismaPg(pool),
    // Keep transactions short on Neon; the sync transaction is the longest one.
    transactionOptions: { maxWait: 5_000, timeout: 15_000 },
  };
  if (!serverTimingEnabled()) return new PrismaClient(options);
  // OVERLOAD_SERVER_TIMING=1 only (measurement, see src/server/perf/server-timing.ts): count queries and database time per
  // request. A client extension runs in the caller's async context (unlike the `query` event), so it can reach the request scope.
  const measured = new PrismaClient(options).$extends({
    query: { $allOperations: ({ args, query }) => measureQuery(() => query(args)) },
  });
  return measured as unknown as PrismaClient;
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
