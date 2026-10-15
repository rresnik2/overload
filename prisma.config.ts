// Prisma 7 CLI config. The CLI (migrate, db push, studio) uses the DIRECT (unpooled) Neon URL.
// The runtime client uses the pooled DATABASE_URL through @prisma/adapter-pg (see src/server/db.ts).
// Prisma 7 does not load .env files itself, so load Next's convention (.env.local first) here.
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

loadEnv({ path: [".env.local", ".env"], quiet: true });

// `prisma generate` / `validate` / `migrate diff --from-schema` never connect, but the config still
// needs a string. A placeholder keeps them working with no database; `migrate deploy` against the
// placeholder fails with a plain connection error instead of silently using the wrong database.
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    url,
    // Only needed by `prisma migrate diff --from-migrations` (CI drift check uses a Postgres service container).
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL || undefined,
  },
});
