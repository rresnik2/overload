import "server-only";
// Catalog and library queries. Catalog rows are global (userId null); custom exercises are filtered by ctx.id on every query.
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogResponse } from "@/contracts/catalog";
import type { ExerciseRow } from "@/contracts/entities";
import type { UserCtx } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { dateToLocalDate } from "@/lib/dates";
import { exerciseToRow } from "@/server/mappers";
import { applyLibraryQuery, type LibraryQuery, type LibraryResult } from "./library";

// ───────────────────────────── GET /api/catalog ─────────────────────────────

/** CatalogMeta.version (0 before the first seed). Cheap: used to answer If-None-Match without loading the catalog. */
export async function getCatalogVersion(): Promise<number> {
  return (await prisma.catalogMeta.findUnique({ where: { id: 1 } }))?.version ?? 0;
}

/** Every global catalog exercise with its muscles, as contract rows. */
export async function loadCatalog(version: number): Promise<CatalogResponse> {
  const rows = await prisma.exercise.findMany({
    where: { userId: null, deletedAt: null },
    include: { muscles: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return { version, generatedAt: new Date().toISOString(), exercises: rows.map(exerciseToRow) };
}

// ───────────────────────────── library ─────────────────────────────

export type { LibraryQuery, LibraryResult } from "./library";

function visibleTo(ctx: UserCtx): Prisma.ExerciseWhereInput {
  return { deletedAt: null, OR: [{ userId: null }, { userId: ctx.id }] };
}

/** The ids of the user's alive favorites. Always filtered by ctx.id. */
export async function listFavoriteExerciseIds(ctx: UserCtx): Promise<Set<string>> {
  const rows = await prisma.exerciseFavorite.findMany({ where: { userId: ctx.id, deletedAt: null }, select: { exerciseId: true } });
  return new Set(rows.map((r) => r.exerciseId));
}

/**
 * The library list for the signed-in user: catalog + their own custom exercises. Only the columns the search and the facets
 * read are fetched for the ~900 visible rows (not the instructions and photo lists); the shared keyword search, filters,
 * facets and paging run in memory (see ./library) and just the page's rows are then loaded in full.
 */
const SLIM_SELECT = { id: true, slug: true, name: true, aliases: true, modality: true, equipment: true, standardLift: true, mechanic: true, muscles: { select: { muscle: true, role: true } } } as const;
type SlimExercise = Prisma.ExerciseGetPayload<{ select: typeof SLIM_SELECT }>;

// The global catalog (about 870 of the ~900 visible rows, with their muscles) only changes when the catalog is re-seeded, which bumps
// CatalogMeta.version. Its slim columns are kept in memory per server instance, keyed by that version, and the version itself is
// re-read at most once a minute: a library request then queries only the user's own exercises, favorites and the page's rows.
const CATALOG_VERSION_TTL_MS = 60_000;
let catalogVersionRead: { at: number; version: number } | null = null;
let slimCatalog: { version: number; rows: SlimExercise[] } | null = null;

async function currentCatalogVersion(now: number): Promise<number> {
  if (catalogVersionRead && now - catalogVersionRead.at < CATALOG_VERSION_TTL_MS) return catalogVersionRead.version;
  const version = await getCatalogVersion();
  catalogVersionRead = { at: now, version };
  return version;
}

async function globalSlimCatalog(): Promise<SlimExercise[]> {
  const version = await currentCatalogVersion(Date.now());
  if (slimCatalog?.version === version) return slimCatalog.rows;
  const rows = await prisma.exercise.findMany({ where: { deletedAt: null, userId: null }, select: SLIM_SELECT });
  slimCatalog = { version, rows };
  return rows;
}

/** Test seam: forget what was cached. */
export function resetLibraryCache(): void {
  catalogVersionRead = null;
  slimCatalog = null;
}

export async function listLibrary(ctx: UserCtx, query: LibraryQuery = {}): Promise<LibraryResult> {
  const [global, own, favoriteIds] = await Promise.all([
    globalSlimCatalog(),
    prisma.exercise.findMany({ where: { deletedAt: null, userId: ctx.id }, select: SLIM_SELECT }), // always this user's: never cached
    listFavoriteExerciseIds(ctx),
  ]);
  const slim = [...global, ...own];
  const page = applyLibraryQuery(slim, query, favoriteIds);
  const rows = await prisma.exercise.findMany({ where: { AND: [visibleTo(ctx), { id: { in: page.exercises.map((e) => e.id) } }] }, include: { muscles: true } });
  const byId = new Map(rows.map((r) => [r.id, exerciseToRow(r)]));
  return { ...page, exercises: page.exercises.flatMap((e) => byId.get(e.id) ?? []) };
}

// ───────────────────────────── detail ─────────────────────────────

export interface ExerciseSeries {
  seriesKey: string;
  machineProfile: { id: string; name: string; gymName: string | null; brand: string | null } | null;
  setCount: number;
  lastLocalDate: string | null;
}

export interface ExerciseDetailResult {
  exercise: ExerciseRow;
  /** The user's progression series for this exercise (default series, plus one per machine profile). Empty when never logged. */
  series: ExerciseSeries[];
}

/** One exercise (catalog or the user's own) with the series the user has for it; null when it does not exist or is someone else's. */
export async function getExerciseDetail(ctx: UserCtx, id: string): Promise<ExerciseDetailResult | null> {
  const row = await prisma.exercise.findFirst({
    where: { AND: [visibleTo(ctx), { id }] },
    include: { muscles: true },
  });
  if (!row) return null;

  const [groups, profiles] = await Promise.all([
    prisma.workoutSet.groupBy({
      by: ["seriesKey", "machineProfileId"],
      where: { userId: ctx.id, exerciseId: id, deletedAt: null, completedAt: { not: null } },
      _count: { _all: true },
      _max: { localDate: true },
    }),
    prisma.machineProfile.findMany({ where: { userId: ctx.id, exerciseId: id, deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const missing = groups.map((g) => g.machineProfileId).filter((p): p is string => p !== null && !profileById.has(p));
  if (missing.length > 0) {
    for (const p of await prisma.machineProfile.findMany({ where: { userId: ctx.id, id: { in: missing } } })) profileById.set(p.id, p);
  }

  const toProfile = (profileId: string | null) => {
    const p = profileId ? profileById.get(profileId) : undefined;
    return p ? { id: p.id, name: p.name, gymName: p.gymName, brand: p.brand } : null;
  };
  const series: ExerciseSeries[] = groups.map((g) => ({
    seriesKey: g.seriesKey,
    machineProfile: toProfile(g.machineProfileId),
    setCount: g._count._all,
    lastLocalDate: g._max.localDate ? dateToLocalDate(g._max.localDate) : null,
  }));
  for (const p of profiles) {
    const key = `${id}:${p.id}`;
    if (!series.some((s) => s.seriesKey === key)) series.push({ seriesKey: key, machineProfile: toProfile(p.id), setCount: 0, lastLocalDate: null });
  }
  series.sort((a, b) => (b.lastLocalDate ?? "").localeCompare(a.lastLocalDate ?? "") || b.setCount - a.setCount);

  return { exercise: exerciseToRow(row), series };
}
