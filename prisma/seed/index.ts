// `pnpm db:seed` (also `prisma db seed`). Idempotent. Uses DIRECT_URL (falls back to DATABASE_URL).
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { seedCatalog } from "./catalog";

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DIRECT_URL or DATABASE_URL in .env.local before seeding.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const { exercises } = await seedCatalog(prisma);
    console.log(`Seeded ${exercises} catalog exercises.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
