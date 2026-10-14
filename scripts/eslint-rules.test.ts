// Proves the architecture rules in eslint.config.mjs actually fire (a rule that silently stops matching is worse than none).
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function messages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === "no-restricted-imports" || m.ruleId === "no-restricted-syntax") ?? [];
}

describe("import rules", () => {
  it("src/lib/** stays pure (no react, next, server, client, IO libraries)", async () => {
    expect(await messages("src/lib/x.ts", 'import { useState } from "react"; export const a = useState;')).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import { prisma } from "@/server/db"; export const a = prisma;')).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import Dexie from "dexie"; export const a = Dexie;')).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import fs from "node:fs"; export const a = fs;')).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import { z } from "zod"; export const a = z;')).toHaveLength(0);
    expect(await messages("src/lib/x.ts", 'import { round } from "@/lib/units"; export const a = round;')).toHaveLength(0);
  });

  it("the Prisma client is importable only under src/server/** and prisma/**", async () => {
    const code = 'import { PrismaClient } from "@/generated/prisma/client"; export const a = PrismaClient;';
    expect(await messages("src/components/x.tsx", code)).toHaveLength(1);
    expect(await messages("src/app/(app)/page.tsx", code)).toHaveLength(1);
    expect(await messages("src/client/x.ts", code)).toHaveLength(1);
    expect(await messages("src/lib/x.ts", code)).toHaveLength(1);
    expect(await messages("src/components/x.tsx", 'import { Prisma } from "@prisma/client"; export const a = Prisma;')).toHaveLength(1);
    expect(await messages("src/server/x.ts", code)).toHaveLength(0);
    expect(await messages("prisma/seed/x.ts", code)).toHaveLength(0);
  });

  it("Decimal never leaves src/server", async () => {
    expect(await messages("src/components/x.tsx", 'import Decimal from "decimal.js"; export const a = Decimal;')).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import Decimal from "decimal.js"; export const a = Decimal;')).toHaveLength(1);
  });

  it("client code cannot import src/server/**, and server code cannot import client code", async () => {
    expect(await messages("src/client/x.ts", 'import { prisma } from "@/server/db"; export const a = prisma;')).toHaveLength(1);
    expect(await messages("src/server/x.ts", 'import { repo } from "@/client/repo"; export const a = repo;')).toHaveLength(1);
    expect(await messages("src/server/x.ts", 'import { HardCard } from "@/components/primitives/HardCard"; export const a = HardCard;')).toHaveLength(1);
  });

  it("database drivers belong to src/server/db.ts only", async () => {
    expect(await messages("src/components/x.tsx", 'import { Pool } from "pg"; export const a = Pool;')).toHaveLength(1);
  });
});

describe("no userId in input schemas", () => {
  it("flags a Zod object that declares userId", async () => {
    const bad = 'import { z } from "zod"; export const s = z.object({ userId: z.string(), name: z.string() });';
    expect(await messages("src/server/actions/x.ts", bad)).toHaveLength(1);
    expect(await messages("src/lib/x.ts", 'import { z } from "zod"; export const s = z.strictObject({ userId: z.string() });')).toHaveLength(1);
    expect(await messages("src/server/x.ts", 'import { z } from "zod"; export const s = base.extend({ userId: z.string() });')).toHaveLength(1);
  });

  it("allows schemas without it and plain where clauses", async () => {
    expect(await messages("src/server/x.ts", 'import { z } from "zod"; export const s = z.object({ name: z.string() });')).toHaveLength(0);
    expect(await messages("src/server/x.ts", "export const w = (ctx: { id: string }) => ({ where: { userId: ctx.id } });")).toHaveLength(0);
  });
});
