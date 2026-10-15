import "server-only";
// The library list, computed in memory from the exercises visible to the user (~900 rows with muscles): the SAME keyword
// search module the offline picker uses (src/lib/search/exercise-search.ts), then the muscle/modality/equipment filters,
// the facets and the paging. No Prisma here, so it is unit-testable and the picker/library agreement test can run
// one fixture list through both code paths.
import type { ExerciseRow } from "@/contracts/entities";
import { MODALITY_VALUES, type Equipment, type Modality, type Muscle } from "@/contracts/enums";
import { buildSearchIndex, searchExercises, type SearchableExercise } from "@/lib/search/exercise-search";

/** What the library needs from a row to search, filter and facet it (a full ExerciseRow, or the slim columns listLibrary selects). */
export type LibraryRow = SearchableExercise;

export interface LibraryQuery {
  modality?: Modality | null;
  equipment?: Equipment | null;
  muscle?: Muscle | null;
  text?: string;
  /** Only the user's starred exercises. */
  favoritesOnly?: boolean;
  /** 1-based. */
  page?: number;
  pageSize?: number;
}

export interface LibraryResult<T extends LibraryRow = ExerciseRow> {
  exercises: T[];
  /** Exercises matching every filter. */
  total: number;
  page: number;
  pageCount: number;
  /** Per modality, under the muscle, text and favorites filters (not the modality/equipment filters): drives the tab counts. */
  modalityCounts: Record<Modality, number>;
  /** Equipment available within the selected modality (all equipment when none is selected), under the muscle, text and favorites filters. */
  equipmentOptions: { equipment: Equipment; count: number }[];
  /** Every exercise id the user has starred (drives the star state of the cards on first paint). */
  favoriteIds: string[];
}

/**
 * `visible` = catalog + the caller's own custom exercises (alive); the caller decides visibility, never this function.
 * With text, results are in rank order (favorites win ties); without, in name order.
 */
export function applyLibraryQuery<T extends LibraryRow>(visible: readonly T[], query: LibraryQuery, favoriteIds: ReadonlySet<string>): LibraryResult<T> {
  const pageSize = query.pageSize ?? 48;
  const byId = new Map(visible.map((e) => [e.id, e]));
  const text = query.text?.trim() ?? "";

  const muscleFiltered = query.muscle ? visible.filter((e) => e.muscles.some((m) => m.muscle === query.muscle)) : visible;
  const ranked = searchExercises(buildSearchIndex(muscleFiltered), text, { favoriteIds: text ? favoriteIds : undefined });
  const shared = ranked.map((h) => byId.get(h.id) as T).filter((e) => !query.favoritesOnly || favoriteIds.has(e.id));

  const modalityScoped = query.modality ? shared.filter((e) => e.modality === query.modality) : shared;
  const matching = query.equipment ? modalityScoped.filter((e) => e.equipment === query.equipment) : modalityScoped;

  const total = matching.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);

  const modalityCounts = Object.fromEntries(MODALITY_VALUES.map((m) => [m, 0])) as Record<Modality, number>;
  for (const e of shared) modalityCounts[e.modality] += 1;
  const equipmentCounts = new Map<Equipment, number>();
  for (const e of modalityScoped) equipmentCounts.set(e.equipment, (equipmentCounts.get(e.equipment) ?? 0) + 1);

  return {
    exercises: matching.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageCount,
    modalityCounts,
    equipmentOptions: [...equipmentCounts].map(([equipment, count]) => ({ equipment, count })).sort((a, b) => b.count - a.count || (a.equipment < b.equipment ? -1 : 1)),
    favoriteIds: [...favoriteIds].sort(),
  };
}
