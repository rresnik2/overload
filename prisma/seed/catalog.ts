// Catalog seeding: every free-exercise-db row goes through classify() (rules + overrides.json) and is upserted with its
// stable UUIDv5 id (catalogExerciseId). Idempotent: reseeding keeps every id, rewrites only rows whose content changed,
// and bumps CatalogMeta.version (the /api/catalog ETag) only when something actually changed.
import fs from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ExerciseClassification, FreeExerciseDbRow } from "@/contracts/catalog";
import { catalogExerciseId } from "@/lib/ids";
import { classify } from "./classify";

export function loadSourceRows(): FreeExerciseDbRow[] {
  return JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "data", "free-exercise-db.json"), "utf8")) as FreeExerciseDbRow[];
}

/** The Exercise row (without id) for a classification: global catalog rows have userId null, hlc "" and version 0. */
export function catalogData(c: ExerciseClassification) {
  return {
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
}
type CatalogData = ReturnType<typeof catalogData>;

const sameList = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const muscleKey = (m: { muscle: string; role: string }) => `${m.muscle}:${m.role}`;

function unchanged(existing: ExistingRow, data: CatalogData, muscles: ExerciseClassification["muscles"]): boolean {
  return (
    existing.slug === data.slug &&
    existing.name === data.name &&
    existing.modality === data.modality &&
    existing.equipment === data.equipment &&
    existing.loadType === data.loadType &&
    existing.tracking === data.tracking &&
    (existing.bodyweightFactor === null ? null : Number(existing.bodyweightFactor)) === data.bodyweightFactor &&
    existing.isUnilateral === data.isUnilateral &&
    existing.mechanic === data.mechanic &&
    existing.force === data.force &&
    existing.level === data.level &&
    existing.category === data.category &&
    existing.standardLift === data.standardLift &&
    existing.hlc === "" &&
    existing.version === 0 &&
    existing.deletedAt === null &&
    sameList(existing.aliases, data.aliases) &&
    sameList(existing.instructions, data.instructions) &&
    sameList(existing.images, data.images) &&
    sameList(existing.muscles.map(muscleKey).sort(), muscles.map(muscleKey).sort())
  );
}

type ExistingRow = Awaited<ReturnType<typeof loadExisting>>[number];
const loadExisting = (prisma: PrismaClient) =>
  prisma.exercise.findMany({ where: { userId: null }, include: { muscles: true } });

const chunk = <T>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

export interface SeedCatalogResult {
  /** Catalog exercises in the dataset (and now in the database). */
  exercises: number;
  created: number;
  updated: number;
  unchanged: number;
  /** CatalogMeta.version after seeding. */
  version: number;
}

export async function seedCatalog(prisma: PrismaClient): Promise<SeedCatalogResult> {
  const classified = loadSourceRows().map((row) => classify(row));
  const existingById = new Map((await loadExisting(prisma)).map((e) => [e.id, e]));

  const toCreate: { id: string; c: ExerciseClassification }[] = [];
  const toUpdate: { id: string; c: ExerciseClassification }[] = [];
  for (const c of classified) {
    const id = catalogExerciseId(c.sourceId);
    const existing = existingById.get(id);
    if (!existing) toCreate.push({ id, c });
    else if (!unchanged(existing, catalogData(c), c.muscles)) toUpdate.push({ id, c });
  }

  for (const batch of chunk(toCreate, 100)) {
    await prisma.exercise.createMany({ data: batch.map(({ id, c }) => ({ id, ...catalogData(c) })), skipDuplicates: true });
    await prisma.exerciseMuscle.createMany({
      data: batch.flatMap(({ id, c }) => c.muscles.map((m) => ({ exerciseId: id, muscle: m.muscle, role: m.role }))),
      skipDuplicates: true,
    });
  }
  for (const batch of chunk(toUpdate, 25)) {
    await prisma.$transaction([
      ...batch.map(({ id, c }) => prisma.exercise.update({ where: { id }, data: { ...catalogData(c), deletedAt: null } })),
      prisma.exerciseMuscle.deleteMany({ where: { exerciseId: { in: batch.map((b) => b.id) } } }),
      prisma.exerciseMuscle.createMany({
        data: batch.flatMap(({ id, c }) => c.muscles.map((m) => ({ exerciseId: id, muscle: m.muscle, role: m.role }))),
      }),
    ]);
  }

  const changed = toCreate.length + toUpdate.length;
  const meta = await prisma.catalogMeta.findUnique({ where: { id: 1 } });
  let version = meta?.version ?? 0;
  if (!meta) {
    version = (await prisma.catalogMeta.create({ data: { id: 1, version: 1 } })).version;
  } else if (changed > 0) {
    version = (await prisma.catalogMeta.update({ where: { id: 1 }, data: { version: { increment: 1 } } })).version;
  }

  return { exercises: classified.length, created: toCreate.length, updated: toUpdate.length, unchanged: classified.length - changed, version };
}
