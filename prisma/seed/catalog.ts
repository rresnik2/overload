// Catalog seeding. Phase 0: the 30 starter exercises. Stream C replaces the body with the full classifier over all rows
// (keep the exported signature: `seedCatalog(prisma)`), keeping catalog ids stable via catalogExerciseId().
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import type { FreeExerciseDbRow } from "@/contracts/catalog";
import { catalogExerciseId } from "@/lib/ids";
import { STARTER_LABELS, classifyStarter } from "./starter-exercises";

export function loadSourceRows(): FreeExerciseDbRow[] {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "data", "free-exercise-db.json"), "utf8")) as FreeExerciseDbRow[];
}

export async function seedCatalog(prisma: PrismaClient): Promise<{ exercises: number }> {
  const byId = new Map(loadSourceRows().map((r) => [r.id, r]));
  let count = 0;
  for (const [sourceId, label] of Object.entries(STARTER_LABELS)) {
    const source = byId.get(sourceId);
    if (!source) throw new Error(`starter exercise not in dataset: ${sourceId}`);
    const c = classifyStarter(source, label);
    const id = catalogExerciseId(sourceId);
    const data = {
      userId: null,
      sourceId: c.sourceId,
      slug: c.slug,
      name: c.name,
      aliases: c.aliases,
      modality: c.modality,
      equipment: c.equipment,
      loadType: c.loadType,
      tracking: c.tracking,
      bodyweightFactor: c.bodyweightFactor,
      isUnilateral: c.isUnilateral,
      mechanic: c.mechanic,
      force: c.force,
      level: c.level,
      category: c.category,
      standardLift: c.standardLift,
      instructions: c.instructions,
      images: c.images,
      hlc: "",
      version: 0,
    };
    await prisma.$transaction([
      prisma.exercise.upsert({ where: { id }, create: { id, ...data }, update: data }),
      prisma.exerciseMuscle.deleteMany({ where: { exerciseId: id } }),
      prisma.exerciseMuscle.createMany({ data: c.muscles.map((m) => ({ exerciseId: id, muscle: m.muscle, role: m.role })) }),
    ]);
    count += 1;
  }
  // Bump the catalog version so /api/catalog ETags change.
  await prisma.catalogMeta.upsert({ where: { id: 1 }, create: { id: 1, version: 1 }, update: { version: { increment: 1 } } });
  return { exercises: count };
}
