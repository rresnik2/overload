// The Dexie-backed implementation of the frozen `Repo` interface (src/contracts/repo.ts).
// Every write is ONE transaction: row + per-field HLC + outbox mutation (see core.ts). Reads hide tombstones.
import { generateKeyBetween } from "fractional-indexing";
import type {
  BodyMetricRow,
  EntityName,
  ExerciseFavoriteRow,
  ExerciseRow,
  MachineProfileRow,
  TemplateExerciseRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "@/contracts/entities";
import { RepoError, type EntityRepo, type ExerciseSearch, type LastTimeEntry, type Repo } from "@/contracts/repo";
import type { CatalogResponse } from "@/contracts/catalog";
import { pickGear } from "@/client/repo/gear";
import { favoriteId, seriesKey } from "@/lib/ids";
import { buildSearchIndex, searchExercises, type SearchIndex } from "@/lib/search/exercise-search";
import { valuesEqual } from "@/lib/sync/merge";
import { toLocalDate } from "@/lib/dates";
import { tickHlc } from "@/client/db/clock";
import { dx } from "@/client/db/zone";
import { META_KEYS, getMeta, setMeta, type OverloadDb } from "@/client/db/schema";
import {
  applyPatch,
  checkRefs,
  deriveLocal,
  enqueue,
  findRow,
  freshId,
  isCatalogExercise,
  nowIso,
  parseCreate,
  parsePatch,
  readTx,
  tombstone,
  writeTx,
  type AnyRow,
  type RowOf,
} from "./core";

type GetDb = () => OverloadDb;

const alive = <T extends { deletedAt: string | null }>(rows: T[]): T[] => rows.filter((r) => !r.deletedAt);
/** Fractional-index keys compare by code unit, never by locale. */
const byPosition = <T extends { position: string }>(a: T, b: T): number => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/** Position order; two devices that appended at the same time share a position, so fall back to creation time, then id. */
const byFavoriteOrder = (a: ExerciseFavoriteRow, b: ExerciseFavoriteRow): number =>
  byPosition(a, b) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The search index over every exercise, rebuilt only when an exercise (or the catalog) changed: typing re-runs `search` per keystroke. */
let indexCache: { key: string; index: SearchIndex } | null = null;
function searchIndexFor(db: OverloadDb, all: readonly ExerciseRow[]): SearchIndex {
  const key = `${db.name}|${all.map((e) => `${e.id}:${e.version}:${e.updatedAt}`).join(",")}`;
  if (indexCache?.key !== key) indexCache = { key, index: buildSearchIndex(all) };
  return indexCache.index;
}

/** A position after `last`. A position that is not a valid fractional key (any string passes the schema) must not make starring throw for good. */
function appendPosition(last: string | undefined): string {
  try {
    return generateKeyBetween(last ?? null, null);
  } catch {
    return generateKeyBetween(null, null);
  }
}

/** Exercise ids of the alive favorites (a favorite whose exercise vanished still counts: harmless, and it can come back). */
const favoriteExerciseIds = async (db: OverloadDb): Promise<Set<string>> => new Set(alive(await db.exerciseFavorite.toArray()).map((f) => f.exerciseId));

function todayLocal(): string {
  return toLocalDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function entityRepo<E extends EntityName>(getDb: GetDb, entity: E): EntityRepo<E> {
  type Row = RowOf<E>;
  return {
    async get(id) {
      const row = (await findRow(getDb(), entity, id)) as AnyRow | undefined;
      return row && !row.deletedAt ? (row as unknown as Row) : undefined;
    },

    async list() {
      const db = getDb();
      const own = (await db.entityTable(entity).toArray()) as AnyRow[];
      const rows = entity === "exercise" ? [...own, ...((await db.catalog.toArray()) as unknown as AnyRow[])] : own;
      return alive(rows) as unknown as Row[];
    },

    async create(input, opts) {
      const db = getDb();
      const fields = parseCreate(entity, input);
      return writeTx(db, async () => {
        const id = freshId(opts);
        if (await findRow(db, entity, id)) throw new RepoError("CONFLICT", `${entity} ${id} already exists`);
        await checkRefs(db, entity, fields);
        const hlc = await tickHlc(db);
        const fieldHlc = Object.fromEntries(Object.keys(fields).map((f) => [f, hlc]));
        const now = nowIso();
        let row: AnyRow = { id, ...fields, hlc, fieldHlc, version: 0, deletedAt: null, createdAt: now, updatedAt: now };
        if (entity === "exercise") row = { ...row, isCustom: true, sourceId: null };
        if (entity === "workoutSet") {
          const derived = await deriveLocal(db, fields as { workoutExerciseId: string; weightKg: number | null; reps: number | null; rir: number | null });
          if (!derived) throw new RepoError("NOT_FOUND", "workoutSet.workoutExerciseId: its workout, exercise or workout exercise is missing");
          row = { ...row, ...derived };
        }
        await db.entityTable(entity).add(row);
        await enqueue(db, entity, id, fields, fieldHlc);
        return row as unknown as Row;
      });
    },

    async update(id, patch) {
      const db = getDb();
      const changes = parsePatch(entity, patch);
      return writeTx(db, async () => {
        if (entity === "exercise" && (await isCatalogExercise(db, id))) throw new RepoError("READONLY_CATALOG", "Catalog exercises are read-only");
        const row = await findRow(db, entity, id);
        if (!row || row.deletedAt) throw new RepoError("NOT_FOUND", `${entity} ${id} not found`);
        const effective = Object.fromEntries(Object.entries(changes).filter(([f, v]) => !valuesEqual(row[f], v)));
        if (Object.keys(effective).length === 0) return row as unknown as Row;
        await checkRefs(db, entity, effective);
        return (await applyPatch(db, entity, row, effective)) as unknown as Row;
      });
    },

    async remove(id) {
      const db = getDb();
      await writeTx(db, async () => {
        if (entity === "exercise" && (await isCatalogExercise(db, id))) throw new RepoError("READONLY_CATALOG", "Catalog exercises are read-only");
        const row = await findRow(db, entity, id);
        if (!row || row.deletedAt) return; // idempotent
        await tombstone(db, entity, row);
      });
    },
  };
}

export function createRepo(getDb: GetDb): Repo {
  const exercises = entityRepo(getDb, "exercise");
  const machineProfiles = entityRepo(getDb, "machineProfile");
  const bodyMetrics = entityRepo(getDb, "bodyMetric");
  const templates = entityRepo(getDb, "template");
  const templateExercises = entityRepo(getDb, "templateExercise");
  const workouts = entityRepo(getDb, "workout");
  const workoutExercises = entityRepo(getDb, "workoutExercise");
  const sets = entityRepo(getDb, "workoutSet");
  const favorites = entityRepo(getDb, "exerciseFavorite");

  /** Most recently started workouts first (alive only). */
  const recentWorkouts = async (db: OverloadDb): Promise<WorkoutRow[]> => alive(await db.workout.orderBy("startedAt").reverse().toArray());

  const repo: Repo = {
    exercises: {
      ...exercises,
      async search(query: ExerciseSearch) {
        const all = (await exercises.list()) as ExerciseRow[];
        const text = query.text?.trim() ?? "";
        const favoriteIds = text ? await favoriteExerciseIds(getDb()) : undefined;
        // Ranking depends on the exercise and the query only, so one index over every exercise serves any filter: rank, then filter.
        const byId = new Map(all.map((e) => [e.id, e]));
        const hits = searchExercises(searchIndexFor(getDb(), all), text, { favoriteIds });
        const matches = hits.flatMap((h) => {
          const e = byId.get(h.id) as ExerciseRow;
          if (query.customOnly && !e.isCustom) return [];
          if (query.modality && e.modality !== query.modality) return [];
          if (query.equipment && e.equipment !== query.equipment) return [];
          if (query.standardLift && e.standardLift !== query.standardLift) return [];
          if (query.muscle && !e.muscles.some((m) => m.muscle === query.muscle)) return [];
          return [e];
        });
        return query.limit !== undefined ? matches.slice(0, Math.max(0, query.limit)) : matches;
      },
      async bySlug(slug) {
        const all = (await exercises.list()) as ExerciseRow[];
        return all.find((e) => e.slug === slug && e.isCustom) ?? all.find((e) => e.slug === slug);
      },
      async recent(limit = 10) {
        const db = getDb();
        return readTx(db, async () => {
          const out: ExerciseRow[] = [];
          const seen = new Set<string>();
          for (const workout of await recentWorkouts(db)) {
            const wes = alive(await db.workoutExercise.where("workoutId").equals(workout.id).toArray()).sort(byPosition);
            for (const we of wes) {
              if (seen.has(we.exerciseId)) continue;
              seen.add(we.exerciseId);
              const exercise = (await findRow(db, "exercise", we.exerciseId)) as unknown as ExerciseRow | undefined;
              if (exercise && !exercise.deletedAt) out.push(exercise);
              if (out.length >= limit) return out;
            }
          }
          return out;
        });
      },
    },

    favorites: {
      async list() {
        const db = getDb();
        return readTx(db, async () => {
          const rows = alive(await db.exerciseFavorite.toArray()).sort(byFavoriteOrder);
          const out: ExerciseRow[] = [];
          for (const row of rows) {
            const exercise = (await findRow(db, "exercise", row.exerciseId)) as unknown as ExerciseRow | undefined;
            if (exercise && !exercise.deletedAt) out.push(exercise);
          }
          return out;
        });
      },
      async ids() {
        return favoriteExerciseIds(getDb());
      },
      async isFavorite(exerciseId) {
        const db = getDb();
        const row = await db.exerciseFavorite.get(favoriteId(db.userId, exerciseId));
        return row !== undefined && !row.deletedAt;
      },
      async toggle(exerciseId) {
        const db = getDb();
        return writeTx(db, async () => {
          const id = favoriteId(db.userId, exerciseId);
          const row = (await db.exerciseFavorite.get(id)) as AnyRow | undefined;
          if (row && !row.deletedAt) {
            await tombstone(db, "exerciseFavorite", row);
            return false;
          }
          // Restore keeps the old position; a first star appends after the last one.
          if (row) await applyPatch(db, "exerciseFavorite", row, { deletedAt: null });
          else {
            const last = alive(await db.exerciseFavorite.toArray()).sort(byFavoriteOrder).at(-1);
            await favorites.create({ exerciseId, position: appendPosition(last?.position) }, { id });
          }
          return true;
        });
      },
    },

    machineProfiles: {
      ...machineProfiles,
      async forExercise(exerciseId) {
        const rows = alive(await getDb().machineProfile.where("exerciseId").equals(exerciseId).toArray());
        return rows.sort((a, b) => a.name.localeCompare(b.name));
      },
      async lastUsedFor(exerciseId) {
        const db = getDb();
        return readTx(db, async () => {
          for (const workout of await recentWorkouts(db)) {
            const wes = alive(await db.workoutExercise.where("workoutId").equals(workout.id).toArray());
            const used = wes.filter((we) => we.exerciseId === exerciseId && we.machineProfileId).sort(byPosition).at(-1);
            if (!used?.machineProfileId) continue;
            const profile = await db.machineProfile.get(used.machineProfileId);
            if (profile && !profile.deletedAt) return profile as MachineProfileRow;
          }
          return undefined;
        });
      },
      async gear(equipment, gymName) {
        // The table is small and null cannot be a Dexie key, so scan rather than index (see pickGear for the per-gym fallback).
        const rows = alive(await getDb().machineProfile.filter((r) => r.equipment === equipment && r.exerciseId == null).toArray());
        return pickGear(rows, equipment, gymName);
      },
    },

    bodyMetrics: {
      ...bodyMetrics,
      async inRange(from, to) {
        const rows = await getDb().bodyMetric.where("localDate").between(from, to, true, true).toArray();
        return alive(rows).sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : a.measuredAt > b.measuredAt ? 1 : 0)) as BodyMetricRow[];
      },
      async latest() {
        const rows = alive(await getDb().bodyMetric.orderBy("measuredAt").reverse().toArray());
        return rows[0] as BodyMetricRow | undefined;
      },
    },

    templates: {
      ...templates,
      async exercisesOf(templateId) {
        const rows = alive(await getDb().templateExercise.where("templateId").equals(templateId).toArray());
        return rows.sort(byPosition) as TemplateExerciseRow[];
      },
    },

    templateExercises,

    workouts: {
      ...workouts,
      async active() {
        return (await recentWorkouts(getDb())).find((w) => w.endedAt == null);
      },
      async inRange(from, to) {
        const rows = await getDb().workout.where("localDate").between(from, to, true, true).toArray();
        return alive(rows).sort((a, b) => (a.localDate !== b.localDate ? (a.localDate < b.localDate ? 1 : -1) : a.startedAt < b.startedAt ? 1 : -1));
      },
      async finish(id, endedAt) {
        return (await workouts.update(id, { endedAt: endedAt ?? nowIso() })) as WorkoutRow;
      },
    },

    workoutExercises: {
      ...workoutExercises,
      async forWorkout(workoutId) {
        const rows = alive(await getDb().workoutExercise.where("workoutId").equals(workoutId).toArray());
        return rows.sort(byPosition) as WorkoutExerciseRow[];
      },
    },

    sets: {
      ...sets,
      async forWorkoutExercise(workoutExerciseId) {
        const rows = alive(await getDb().workoutSet.where("workoutExerciseId").equals(workoutExerciseId).toArray());
        return rows.sort(byPosition) as WorkoutSetRow[];
      },
      async forWorkout(workoutId) {
        const db = getDb();
        return readTx(db, async () => {
          const wes = alive(await db.workoutExercise.where("workoutId").equals(workoutId).toArray()).sort(byPosition);
          const out: WorkoutSetRow[] = [];
          for (const we of wes) out.push(...(await repo.sets.forWorkoutExercise(we.id)));
          return out;
        });
      },
      async forSeries(key) {
        return alive(await getDb().workoutSet.where("seriesKey").equals(key).toArray()) as WorkoutSetRow[];
      },
      async lastTime({ exerciseId, machineProfileId, beforeLocalDate }): Promise<LastTimeEntry | undefined> {
        const before = beforeLocalDate ?? todayLocal();
        const candidates = alive(await getDb().workoutSet.where("seriesKey").equals(seriesKey(exerciseId, machineProfileId)).toArray()).filter(
          (s) => s.completedAt != null && s.localDate < before,
        );
        if (candidates.length === 0) return undefined;
        const newest = new Map<string, { localDate: string; latest: string }>();
        for (const s of candidates) {
          const cur = newest.get(s.workoutId);
          const completed = s.completedAt as string;
          if (!cur) newest.set(s.workoutId, { localDate: s.localDate, latest: completed });
          else if (completed > cur.latest) cur.latest = completed;
        }
        const [workoutId, info] = [...newest].sort(([, a], [, b]) => (a.localDate !== b.localDate ? (a.localDate < b.localDate ? 1 : -1) : a.latest < b.latest ? 1 : -1))[0] as [string, { localDate: string }];
        // Completed sets of every type, ordered by position (a UI that wants working sets only filters on setType).
        return { workoutId, localDate: info.localDate, sets: candidates.filter((s) => s.workoutId === workoutId).sort(byPosition) };
      },
    },

    catalog: {
      async version() {
        return (await getMeta<number>(getDb(), META_KEYS.catalogVersion)) ?? null;
      },
      async replace(catalog: CatalogResponse) {
        const db = getDb();
        await writeTx(db, async () => {
          await db.catalog.clear();
          await db.catalog.bulkPut(catalog.exercises);
          await setMeta(db, META_KEYS.catalogVersion, catalog.version);
        });
      },
    },

    async transact(fn) {
      const db = getDb();
      return writeTx(db, () => fn(repo));
    },
  };
  return zoneWrap(repo);
}

/**
 * Wrap every method so it returns a Dexie.Promise (see db/zone.ts): `repo.transact(async (tx) => { await tx.a.create(); await tx.b.create(); })`
 * then keeps one IndexedDB transaction alive across the awaits. Wrapped in place so internal `repo.*` calls are wrapped too.
 */
function zoneWrap<T extends object>(obj: T): T {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "function") (obj as Record<string, unknown>)[key] = dx(value as (...args: unknown[]) => Promise<unknown>);
    else if (value && typeof value === "object") zoneWrap(value);
  }
  return obj;
}
