import "server-only";
// Catalog and library queries. Catalog rows are global (userId null); custom exercises are filtered by ctx.id on every query.
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogResponse } from "@/contracts/catalog";
import type { ExerciseRow } from "@/contracts/entities";
import { MODALITY_VALUES, type Equipment, type Modality, type Muscle } from "@/contracts/enums";
import { slugify } from "@/lib/ids";
import type { UserCtx } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { dateToLocalDate } from "@/lib/dates";
import { exerciseToRow } from "@/server/mappers";

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

export interface LibraryQuery {
  modality?: Modality | null;
  equipment?: Equipment | null;
  muscle?: Muscle | null;
  text?: string;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface LibraryResult {
  exercises: ExerciseRow[];
  /** Exercises matching every filter. */
  total: number;
  page: number;
  pageCount: number;
  /** Per modality, under the muscle and text filters (not the modality/equipment filters): drives the tab counts. */
  modalityCounts: Record<Modality, number>;
  /** Equipment available within the selected modality (all equipment when none is selected), under the muscle and text filters. */
  equipmentOptions: { equipment: Equipment; count: number }[];
}

function visibleTo(ctx: UserCtx): Prisma.ExerciseWhereInput {
  return { deletedAt: null, OR: [{ userId: null }, { userId: ctx.id }] };
}

function textFilter(text: string | undefined): Prisma.ExerciseWhereInput[] {
  const tokens = (text ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  return tokens.map((token) => ({
    OR: [
      { name: { contains: token, mode: "insensitive" as const } },
      { slug: { contains: slugify(token) || token } },
      { aliases: { has: token } },
    ],
  }));
}

/** The library list for the signed-in user: catalog + their own custom exercises, filtered, paged, with tab and equipment facets. */
export async function listLibrary(ctx: UserCtx, query: LibraryQuery = {}): Promise<LibraryResult> {
  const pageSize = query.pageSize ?? 48;
  const shared: Prisma.ExerciseWhereInput[] = [
    visibleTo(ctx),
    ...textFilter(query.text),
    ...(query.muscle ? [{ muscles: { some: { muscle: query.muscle } } }] : []),
  ];
  const modalityWhere: Prisma.ExerciseWhereInput[] = query.modality ? [{ modality: query.modality }] : [];
  const equipmentWhere: Prisma.ExerciseWhereInput[] = query.equipment ? [{ equipment: query.equipment }] : [];
  const where: Prisma.ExerciseWhereInput = { AND: [...shared, ...modalityWhere, ...equipmentWhere] };

  const total = await prisma.exercise.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);

  const [rows, modalityGroups, equipmentGroups] = await Promise.all([
    prisma.exercise.findMany({
      where,
      include: { muscles: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.groupBy({ by: ["modality"], where: { AND: shared }, _count: { _all: true } }),
    prisma.exercise.groupBy({ by: ["equipment"], where: { AND: [...shared, ...modalityWhere] }, _count: { _all: true } }),
  ]);

  const modalityCounts = Object.fromEntries(MODALITY_VALUES.map((m) => [m, 0])) as Record<Modality, number>;
  for (const g of modalityGroups) modalityCounts[g.modality] = g._count._all;

  return {
    exercises: rows.map(exerciseToRow),
    total,
    page,
    pageCount,
    modalityCounts,
    equipmentOptions: equipmentGroups.map((g) => ({ equipment: g.equipment, count: g._count._all })).sort((a, b) => b.count - a.count),
  };
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
