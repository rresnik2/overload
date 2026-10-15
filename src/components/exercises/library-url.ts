// URL <-> library filter state. PURE. The exercise library is driven entirely by the query string (works without JS, shareable).
import { EQUIPMENT_VALUES, MODALITY_VALUES, MUSCLE_VALUES, type Equipment, type Modality, type Muscle } from "@/contracts/enums";

export const LIBRARY_PAGE_SIZE = 48;

export interface LibraryFilters {
  /** null = all modalities. */
  modality: Modality | null;
  equipment: Equipment | null;
  muscle: Muscle | null;
  /** Free text: every word must match the name, aliases, equipment, modality or muscles (see src/lib/search/exercise-search.ts). */
  q: string;
  /** Only the user's starred exercises (`fav=1`). */
  fav: boolean;
  /** 1-based. */
  page: number;
}

export const DEFAULT_FILTERS: LibraryFilters = { modality: null, equipment: null, muscle: null, q: "", fav: false, page: 1 };

/** "MACHINE_PLATE_LOADED" -> "machine-plate-loaded" */
export const toSlug = (value: string): string => value.toLowerCase().replace(/_/g, "-");

function fromSlug<T extends string>(values: readonly T[], slug: string | undefined): T | null {
  if (!slug) return null;
  return values.find((v) => toSlug(v) === slug.toLowerCase()) ?? null;
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** Parse Next's `searchParams` into filters. Unknown values are ignored rather than rejected. */
export function parseLibraryParams(raw: Record<string, string | string[] | undefined>): LibraryFilters {
  const modality = fromSlug(MODALITY_VALUES, first(raw.modality));
  const equipment = fromSlug(EQUIPMENT_VALUES, first(raw.equipment));
  const muscle = fromSlug(MUSCLE_VALUES, first(raw.muscle));
  const q = (first(raw.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const fav = first(raw.fav) === "1";
  const page = Math.max(1, Math.min(1000, Number.parseInt(first(raw.page) ?? "1", 10) || 1));
  return { modality, equipment, muscle, q, fav, page };
}

/**
 * The href for `filters` with `patch` applied. Defaults are omitted. Changing the modality, equipment, muscle or text
 * resets the page; changing the modality clears the equipment (equipment options belong to a modality).
 */
export function libraryHref(basePath: string, filters: LibraryFilters, patch: Partial<LibraryFilters> = {}): string {
  const next: LibraryFilters = { ...filters, ...patch };
  if ("modality" in patch && patch.modality !== filters.modality && !("equipment" in patch)) next.equipment = null;
  if (!("page" in patch)) next.page = 1;
  const params = new URLSearchParams();
  if (next.modality) params.set("modality", toSlug(next.modality));
  if (next.equipment) params.set("equipment", toSlug(next.equipment));
  if (next.muscle) params.set("muscle", toSlug(next.muscle));
  if (next.q) params.set("q", next.q);
  if (next.fav) params.set("fav", "1");
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
