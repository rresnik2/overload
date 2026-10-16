// Dexie schema for the per-user client database `overload-<userId>`.
//
//   one table per synced entity (named exactly like the EntityName) + `catalog` (global read-only exercises)
//   + `outbox` (mutations not yet acknowledged by the server) + `meta` (cursor, HLC state, deviceId, catalog etag, ...)
//
// Migrations: append a new entry to MIGRATIONS (never edit a released one). Dexie runs the `upgrade` of every version
// the user's database has not seen, in order, inside the upgrade transaction.
import Dexie, { type DexieOptions, type Table, type Transaction } from "dexie";
import type {
  BodyMetricRow,
  EntityName,
  ExerciseFavoriteRow,
  ExerciseRow,
  MachineProfileRow,
  TemplateExerciseRow,
  TemplateRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "@/contracts/entities";
import type { Hlc } from "@/contracts/sync";
import { noteWorkoutWrite } from "./active-workout";

export interface OutboxEntry {
  /** Auto-increment: the order in which writes happened. */
  seq?: number;
  /** Idempotency key sent to the server. */
  mutationId: string;
  entity: EntityName;
  id: string;
  fields: Record<string, unknown>;
  fieldHlc: Record<string, Hlc>;
  createdAt: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const META_KEYS = {
  cursor: "cursor",
  hlc: "hlc",
  deviceId: "deviceId",
  catalogVersion: "catalogVersion",
  catalogEtag: "catalogEtag",
  lastSyncedAt: "lastSyncedAt",
  rejectedCount: "rejectedCount",
  /** Id of the active workout, "" when there is none (see ./active-workout.ts). */
  activeWorkout: "activeWorkoutId",
} as const;

interface Migration {
  version: number;
  stores: Record<string, string>;
  upgrade?: (tx: Transaction) => void | Promise<void>;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    stores: {
      exercise: "id, slug, version",
      catalog: "id, slug",
      machineProfile: "id, exerciseId",
      bodyMetric: "id, localDate, measuredAt",
      template: "id",
      templateExercise: "id, templateId",
      workout: "id, localDate, startedAt",
      workoutExercise: "id, workoutId, exerciseId",
      workoutSet: "id, workoutExerciseId, workoutId, machineProfileId, exerciseId, seriesKey",
      outbox: "++seq, mutationId, [entity+id]",
      meta: "key",
    },
  },
  {
    // Starred exercises (the 9th synced entity). Existing tables and rows are untouched (Dexie only adds the new store).
    // The cursor goes back to 0 once: a device that ran the previous bundle advanced its cursor past favorites that
    // another device wrote (that bundle ignores unknown entities), so it must pull them again. Pulling is idempotent
    // (per-field merge) and the outbox is kept, so no local data is lost.
    version: 2,
    stores: { exerciseFavorite: "id, exerciseId, deletedAt" },
    upgrade: (tx) => tx.table("meta").put({ key: META_KEYS.cursor, value: 0 }),
  },
  {
    // No new stores: the active-workout pointer (meta `activeWorkoutId`) is computed once for databases that already hold workouts.
    version: 3,
    stores: {},
    upgrade: async (tx) => {
      const found = await tx.table<WorkoutRow, string>("workout").orderBy("startedAt").reverse().filter((w) => !w.deletedAt && w.endedAt == null).first();
      await tx.table("meta").put({ key: META_KEYS.activeWorkout, value: found?.id ?? "" });
    },
  },
];

export function dbNameFor(userId: string): string {
  return `overload-${userId}`;
}

export class OverloadDb extends Dexie {
  exercise!: Table<ExerciseRow, string>;
  catalog!: Table<ExerciseRow, string>;
  machineProfile!: Table<MachineProfileRow, string>;
  bodyMetric!: Table<BodyMetricRow, string>;
  template!: Table<TemplateRow, string>;
  templateExercise!: Table<TemplateExerciseRow, string>;
  workout!: Table<WorkoutRow, string>;
  workoutExercise!: Table<WorkoutExerciseRow, string>;
  workoutSet!: Table<WorkoutSetRow, string>;
  exerciseFavorite!: Table<ExerciseFavoriteRow, string>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;
  /** Bumped by every write to `catalog` or `exercise`; the repo caches the merged exercise list against it. */
  exercisesGeneration = 0;

  /** `options` is a test seam (an isolated fake-indexeddb factory per simulated device). */
  constructor(
    readonly userId: string,
    options?: DexieOptions,
  ) {
    super(dbNameFor(userId), options);
    for (const m of MIGRATIONS) {
      const version = this.version(m.version).stores(m.stores);
      if (m.upgrade) version.upgrade(m.upgrade);
    }
    // A new database has no workouts, so nothing is active.
    this.on("populate", (tx) => void tx.table("meta").put({ key: META_KEYS.activeWorkout, value: "" }));
    // Any write to an exercise (the catalog or the user's own) invalidates the repo's in-memory exercise list and search index.
    for (const table of [this.catalog, this.exercise]) {
      table.hook("creating", () => void this.exercisesGeneration++);
      table.hook("updating", () => void this.exercisesGeneration++);
      table.hook("deleting", () => void this.exercisesGeneration++);
    }
    // Any write to a workout row marks its transaction; writeTx then refreshes the pointer (./active-workout.ts).
    this.workout.hook("creating", function (_key, _row, transaction) {
      noteWorkoutWrite(transaction);
    });
    this.workout.hook("updating", function (_mods, _key, _row, transaction) {
      noteWorkoutWrite(transaction);
    });
    this.workout.hook("deleting", function (_key, _row, transaction) {
      noteWorkoutWrite(transaction);
    });
  }

  /** The table of a synced entity (exercise rows here are the user's CUSTOM exercises; catalog rows live in `catalog`). */
  entityTable<E extends EntityName>(entity: E): Table<{ id: string } & Record<string, unknown>, string> {
    return this.table(entity);
  }

  /** The tables that hold synced rows (everything except outbox and meta). */
  get syncedTables(): Table[] {
    return [this.exercise, this.machineProfile, this.bodyMetric, this.template, this.templateExercise, this.workout, this.workoutExercise, this.workoutSet, this.exerciseFavorite] as Table[];
  }
}

// Plain functions returning Dexie promises (see zone.ts): safe to call from inside any transaction.
export function getMeta<T>(db: OverloadDb, key: string): Promise<T | undefined> {
  return db.meta.get(key).then((entry) => entry?.value as T | undefined);
}

export function setMeta(db: OverloadDb, key: string, value: unknown): Promise<void> {
  return db.meta.put({ key, value }).then(() => undefined);
}
