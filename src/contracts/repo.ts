// Client data-access contract (Dexie-backed). FROZEN after Phase 0.
// Implementation: stream E1 (src/client/repo/**). Consumers: E2 (logging UI), F (offline reads), B (shell), Wave 3.
//
// Rules every implementation must honour:
//  - Every write is ONE Dexie transaction: row + per-field HLC + outbox mutation. Nothing partial.
//  - `create` assigns a client UUIDv7 (newId()) unless `opts.id` is given, stamps createdAt/updatedAt/hlc/fieldHlc,
//    and returns the stored Row. `version` stays 0 until the server assigns one on pull.
//  - `update` merges ONLY the fields in `patch` (each gets a fresh field HLC). Unknown/forbidden keys throw.
//  - `remove` is a soft delete (sets deletedAt); `list()/get()` hide tombstones unless noted.
//  - For WorkoutSet writes the repo mirrors the server-derived columns locally (workoutId, exerciseId, machineProfileId,
//    seriesKey, localDate, effectiveLoadKg, e1rmKg) using seriesKey()/effectiveLoadKg()/estimate1RM(), so offline reads
//    and "last time" lookups work. The server recomputes them and its values win on the next pull.
//  - Errors: throw `RepoError` with a stable `code`.
import type {
  BodyMetricRow,
  EntityName,
  EntityTypeMap,
  ExerciseRow,
  IsoDateTime,
  LocalDateString,
  MachineProfileRow,
  TemplateExerciseRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "./entities";
import type { Equipment, Modality, Muscle, StandardLift } from "./enums";
import type { CatalogResponse } from "./catalog";

export type RepoErrorCode = "NOT_FOUND" | "INVALID" | "FORBIDDEN_FIELD" | "READONLY_CATALOG" | "CONFLICT";

export class RepoError extends Error {
  readonly code: RepoErrorCode;
  constructor(code: RepoErrorCode, message: string) {
    super(message);
    this.name = "RepoError";
    this.code = code;
  }
}

export interface EntityRepo<E extends EntityName> {
  get(id: string): Promise<EntityTypeMap[E]["row"] | undefined>;
  /** Live (non-deleted) rows, unordered unless a more specific method says otherwise. */
  list(): Promise<EntityTypeMap[E]["row"][]>;
  create(input: EntityTypeMap[E]["create"], opts?: { id?: string }): Promise<EntityTypeMap[E]["row"]>;
  update(id: string, patch: EntityTypeMap[E]["patch"]): Promise<EntityTypeMap[E]["row"]>;
  /** Soft delete (tombstone). Idempotent. */
  remove(id: string): Promise<void>;
}

export interface ExerciseSearch {
  /** Case-insensitive match on name, aliases and slug. */
  text?: string;
  modality?: Modality;
  equipment?: Equipment;
  /** Matches primary OR secondary muscle. */
  muscle?: Muscle;
  standardLift?: StandardLift;
  /** Only the user's custom exercises. */
  customOnly?: boolean;
  limit?: number;
}

/** The previous session's completed sets for the same progression series ("last time" ghost values). */
export interface LastTimeEntry {
  workoutId: string;
  localDate: LocalDateString;
  /** Completed sets ordered by position. */
  sets: WorkoutSetRow[];
}

export interface Repo {
  /** Catalog + custom exercises (one list). Catalog rows are read-only: update/remove throw READONLY_CATALOG. */
  exercises: EntityRepo<"exercise"> & {
    search(query: ExerciseSearch): Promise<ExerciseRow[]>;
    bySlug(slug: string): Promise<ExerciseRow | undefined>;
    /** Exercises most recently logged, newest first. */
    recent(limit?: number): Promise<ExerciseRow[]>;
  };
  machineProfiles: EntityRepo<"machineProfile"> & {
    forExercise(exerciseId: string): Promise<MachineProfileRow[]>;
    /** The profile most recently used for this exercise (drives the "default to last used" machine picker). */
    lastUsedFor(exerciseId: string): Promise<MachineProfileRow | undefined>;
  };
  bodyMetrics: EntityRepo<"bodyMetric"> & {
    /** Inclusive, ordered by measuredAt ascending. */
    inRange(from: LocalDateString, to: LocalDateString): Promise<BodyMetricRow[]>;
    latest(): Promise<BodyMetricRow | undefined>;
  };
  templates: EntityRepo<"template"> & {
    exercisesOf(templateId: string): Promise<TemplateExerciseRow[]>;
  };
  templateExercises: EntityRepo<"templateExercise">;
  workouts: EntityRepo<"workout"> & {
    /** The unfinished workout (endedAt null, not deleted), newest startedAt first if several. */
    active(): Promise<WorkoutRow | undefined>;
    /** By localDate, inclusive, newest first. */
    inRange(from: LocalDateString, to: LocalDateString): Promise<WorkoutRow[]>;
    /** Sets endedAt (default: now). */
    finish(id: string, endedAt?: IsoDateTime): Promise<WorkoutRow>;
  };
  workoutExercises: EntityRepo<"workoutExercise"> & {
    /** Ordered by position. */
    forWorkout(workoutId: string): Promise<WorkoutExerciseRow[]>;
  };
  sets: EntityRepo<"workoutSet"> & {
    /** Ordered by position. */
    forWorkoutExercise(workoutExerciseId: string): Promise<WorkoutSetRow[]>;
    forWorkout(workoutId: string): Promise<WorkoutSetRow[]>;
    /** Every live (non-deleted) set of one progression series, any workout, unordered. Index: workoutSet.seriesKey. */
    forSeries(seriesKey: string): Promise<WorkoutSetRow[]>;
    lastTime(args: {
      exerciseId: string;
      machineProfileId: string | null;
      /** Only sessions strictly before this localDate (default: today). */
      beforeLocalDate?: LocalDateString;
    }): Promise<LastTimeEntry | undefined>;
  };
  catalog: {
    /** CatalogMeta.version of the cached catalog, or null if never fetched. */
    version(): Promise<number | null>;
    /** Replace the cached catalog rows (called by the sync engine after a 200 from /api/catalog). */
    replace(catalog: CatalogResponse): Promise<void>;
  };
  /** Run several writes atomically (one Dexie transaction, one outbox batch). Nested calls join the outer one. */
  transact<T>(fn: (tx: Repo) => Promise<T>): Promise<T>;
}

/** Hook signature (src/client/repo): re-runs `query` whenever the Dexie tables it reads change (wraps dexie-react-hooks). */
export type UseLive = <T>(query: () => Promise<T> | T, deps?: readonly unknown[]) => T | undefined;
