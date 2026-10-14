// Fails when src/contracts/enums.ts drifts from prisma/schema.prisma (the single source of truth for enum values).
// Regenerate the mirror by editing contracts/enums.ts to match; schema changes need a change request.
import { describe, expect, it } from "vitest";
import * as PrismaEnums from "@/generated/prisma/enums";
import { ALL_ENUMS } from "@/contracts/enums";

describe("contract enums match Prisma enums", () => {
  const prismaEnums = Object.fromEntries(
    Object.entries(PrismaEnums).filter(([, value]) => typeof value === "object" && value !== null),
  ) as Record<string, Record<string, string>>;

  it("covers exactly the same enum names", () => {
    expect(Object.keys(ALL_ENUMS).sort()).toEqual(Object.keys(prismaEnums).sort());
  });

  for (const [name, contract] of Object.entries(ALL_ENUMS)) {
    it(`${name} has identical members`, () => {
      expect(contract).toEqual(prismaEnums[name]);
    });
  }
});
