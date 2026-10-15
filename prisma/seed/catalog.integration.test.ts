// Needs a migrated database (your Neon branch in .env.local). Run: pnpm test:integration
import { describe, expect, it } from "vitest";
import { catalogExerciseId } from "@/lib/ids";
import { prisma } from "@/server/db";
import { loadSourceRows, seedCatalog } from "./catalog";

async function snapshot() {
  const rows = await prisma.exercise.findMany({ where: { userId: null }, select: { id: true, sourceId: true }, orderBy: { id: "asc" } });
  const muscles = await prisma.exerciseMuscle.count({ where: { exercise: { userId: null } } });
  const meta = await prisma.catalogMeta.findUnique({ where: { id: 1 } });
  return { rows, muscles, version: meta?.version ?? null };
}

describe("seedCatalog", () => {
  it("seeds every dataset row with its stable id, and reseeding keeps ids, counts and the catalog version", async () => {
    const source = loadSourceRows();
    await seedCatalog(prisma);
    const first = await snapshot();
    const second = await seedCatalog(prisma);
    const after = await snapshot();

    expect(first.rows).toHaveLength(source.length);
    expect(first.rows.map((r) => r.id)).toEqual([...source.map((r) => catalogExerciseId(r.id))].sort());
    expect(after.rows).toEqual(first.rows);
    expect(after.muscles).toBe(first.muscles);
    expect(second).toMatchObject({ exercises: source.length, created: 0, updated: 0, unchanged: source.length });
    expect(after.version).toBe(first.version);
  });

  it("never files a machine-equipped exercise under FREE_WEIGHT, and never a free weight under MACHINE or CABLE", async () => {
    await seedCatalog(prisma);
    const machineEquipment = ["MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "SMITH_MACHINE", "CABLE"] as const;
    expect(await prisma.exercise.count({ where: { userId: null, modality: "FREE_WEIGHT", equipment: { in: [...machineEquipment] } } })).toBe(0);
    expect(await prisma.exercise.count({ where: { userId: null, modality: { in: ["MACHINE", "CABLE"] }, equipment: { in: ["BARBELL", "DUMBBELL", "KETTLEBELL", "EZ_BAR", "TRAP_BAR"] } } })).toBe(0);
  });

  it("writes catalog rows as global, read-only rows (userId null, hlc empty, version 0)", async () => {
    await seedCatalog(prisma);
    expect(await prisma.exercise.count({ where: { userId: null, OR: [{ version: { not: 0 } }, { hlc: { not: "" } }] } })).toBe(0);
  });
});
