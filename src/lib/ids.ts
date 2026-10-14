// Identifier helpers. PURE. FROZEN after Phase 0.
//
// - Every row a client can write gets a client-generated UUIDv7 (time-ordered, index friendly).
// - Catalog exercises use a UUIDv5 derived from their free-exercise-db id, so reseeding keeps ids stable.
//   NEVER change CATALOG_NAMESPACE: it would re-key the whole catalog (and orphan every logged set).
import { v5 as uuidv5, v7 as uuidv7Impl, validate as uuidValidate, version as uuidVersion } from "uuid";

/** Namespace for catalog exercise ids: uuidv5("overload.catalog.free-exercise-db", DNS). Frozen. */
export const CATALOG_NAMESPACE = uuidv5("overload.catalog.free-exercise-db", uuidv5.DNS);

/** A fresh client-side id for any user-written row. */
export function newId(): string {
  return uuidv7Impl();
}

/** Stable catalog id for a free-exercise-db `id` (e.g. "Barbell_Squat"). */
export function catalogExerciseId(sourceId: string): string {
  if (!sourceId) throw new Error("catalogExerciseId: empty sourceId");
  return uuidv5(sourceId, CATALOG_NAMESPACE);
}

export function isUuid(value: string): boolean {
  return uuidValidate(value);
}

export function isUuidV7(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 7;
}

/**
 * Progression series key. Free-weight/bodyweight exercises: just the exerciseId.
 * Machine/cable exercises logged against a MachineProfile: `${exerciseId}:${machineProfileId}`
 * so each gym/brand/machine progresses separately and is never merged or converted.
 */
export function seriesKey(exerciseId: string, machineProfileId?: string | null): string {
  return machineProfileId ? `${exerciseId}:${machineProfileId}` : exerciseId;
}

export function parseSeriesKey(key: string): { exerciseId: string; machineProfileId: string | null } {
  const idx = key.indexOf(":");
  if (idx === -1) return { exerciseId: key, machineProfileId: null };
  return { exerciseId: key.slice(0, idx), machineProfileId: key.slice(idx + 1) };
}

/** "Barbell Back Squat" -> "barbell-back-squat" */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
