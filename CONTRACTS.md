# CONTRACTS.md

The frozen interfaces between streams. Written in Phase 0 and **frozen**: to change anything here (or anything under `src/contracts/**`), file a change request (`CLAUDE.md`, "Change requests"). Signature blocks below are generated from the source by `pnpm docs:sync` (CI fails if they drift), so what you read here is exactly what the compiler enforces.

Read this together with `CLAUDE.md`, your brief (`docs/agents/<stream>.md`) and, for formulas and evidence, `docs/research.md`.

## 1. Conventions

| Topic | Rule |
|---|---|
| IDs | Every row a client can write has a client-generated **UUIDv7** (`newId()` in `src/lib/ids.ts`). Catalog exercises use **UUIDv5** of their free-exercise-db id (`catalogExerciseId(sourceId)`); the namespace is frozen and pinned by a test. |
| Units | Weights are **kg**. Server: `Decimal(7,3)`. Decimal never leaves `src/server` (mappers convert to `number`). The unit the user typed is kept in `inputUnit` so pounds display exactly as entered (`fromKg`, `formatWeight`, `displayUnit` in `src/lib/units.ts`). Effort is stored as RIR; RPE = 10 − RIR (display only). |
| Dates | `Workout.localDate` ("YYYY-MM-DD", the device's local date when the workout started) is the **only** field used to group by day or week. Weeks are ISO, Monday to Sunday (`isoWeekStart`, `isoWeekKey`, … in `src/lib/dates.ts`). Instants are ISO-8601 UTC strings. Analytics never reads the system clock: `today` is passed in. |
| Rows | Contract `Row` types have **no `userId`** (the client database is per user). Kg/cm/% columns are `number`, dates are strings. |
| Writable fields | Each entity's `*FieldsSchema` is a `z.strictObject`: unknown keys (`userId`, `version`, `hlc`, `fieldHlc`, `effectiveLoadKg`, `e1rmKg`, `seriesKey`, denormalized FKs) are **rejected, not stripped**. Patch schemas come from `patchOf()` (defaults removed); never use Zod's `.partial()` on a Fields schema. |
| Series | `seriesKey = exerciseId` or, for machine/cable work logged against a `MachineProfile`, `exerciseId:machineProfileId` (`seriesKey()`, `parseSeriesKey()`). Machine series never merge, never get DOTS/percentiles, never convert to barbell equivalents. |
| Positions | Ordering columns are fractional-index strings (npm `fractional-indexing`). |
| Streams may not | add dependencies, edit the schema, edit `src/contracts/**`, or `import` the Prisma client outside `src/server/**` + `prisma/**`. |

## 2. Entities

Writable fields per entity (everything else on a Row is server- or repo-derived). The authoritative source is `src/contracts/entities.ts`.

| Entity (`EntityName`) | Writable fields | References (`ENTITY_REFS`) |
|---|---|---|
| `exercise` (custom only) | slug, name, aliases, modality, equipment, loadType, tracking, bodyweightFactor, isUnilateral, mechanic, force, level, category, standardLift, instructions, images, **muscles** | none |
| `machineProfile` | name, gymName, brand, exerciseId, labelUnit, pinStepKg, baseLoadKg, notes | exerciseId → exercise (optional) |
| `bodyMetric` | measuredAt, localDate, weightKg, bodyFatPct, bodyFatMethod, neckCm, waistCm, hipCm, chestCm, armCm, thighCm, calfCm, notes | none |
| `template` | name, notes, folder, position | none |
| `templateExercise` | templateId, exerciseId, machineProfileId, position, warmupSets, workingSets, repMin, repMax, targetRir, restSec, supersetKey, notes | template, exercise, machineProfile? |
| `workout` | templateId, title, startedAt, endedAt, localDate, timezone, bodyweightKg, isDeload, notes | template? |
| `workoutExercise` | workoutId, exerciseId, machineProfileId, position, supersetKey, restSec, notes | workout, exercise, machineProfile? |
| `workoutSet` | workoutExerciseId, position, setType, weightKg, inputUnit, reps, rir, durationSec, distanceM, completedAt, notes | workoutExercise |

Plus `deletedAt` (tombstone) on every entity. `WorkoutSet` **server-derived** columns: `workoutId`, `exerciseId`, `machineProfileId`, `seriesKey`, `localDate`, `effectiveLoadKg`, `e1rmKg` (`WorkoutSetDerived`). The client repo mirrors them locally for offline reads; the server recomputes them and its values win.

**Exercise muscles.** `ExerciseMuscle` is not a synced model. For a custom exercise, `muscles` (`{muscle, role}[]`) travels as a normal field of the Exercise mutation (whole-array last-write-wins) and the server materializes the `ExerciseMuscle` rows (delete + insert inside the sync transaction). `ExerciseRow.muscles` always carries the array.

**Catalog exercises** (`userId` null) are read-only, `hlc = ""`, `version = 0`, served by `GET /api/catalog` and cached by `repo.catalog.replace()`. Writing one is `rejected: CATALOG_READONLY` / `RepoError READONLY_CATALOG`. The dataset's `level: "expert"` maps to `ADVANCED`.

<!-- sig: src/contracts/entities.ts#SyncMeta,ExerciseRow,WorkoutSetDerived,WorkoutSetRow,PersonalRecordRow,ProfileRow,EntityTypeMap -->
```ts
// from src/contracts/entities.ts
/** Sync mixin columns carried by every synced Row. */
export interface SyncMeta {
  /** Hybrid logical clock of the row's latest write (HLC string, see src/contracts/sync.ts). "" for catalog rows. */
  hlc: string;
  /** Per-field HLC: field name -> HLC of the write that last set it (last-write-wins per field). */
  fieldHlc: Record<string, string>;
  /** Per-user monotonically increasing change counter assigned by the server (the sync cursor). 0 = never synced / catalog. */
  version: number;
  /** Tombstone. Non-null = deleted (kept 90 days so other devices learn about it). */
  deletedAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface ExerciseRow extends ExerciseFields, SyncMeta {
  id: Uuid;
  /** false = global catalog row (read-only, version 0); true = the user's own custom exercise. */
  isCustom: boolean;
  /** free-exercise-db id for catalog rows, else null. */
  sourceId: string | null;
}

/** Columns the SERVER derives (and the client repo mirrors locally for offline reads; the server's values win on pull). */
export interface WorkoutSetDerived {
  workoutId: Uuid;
  exerciseId: Uuid;
  machineProfileId: Uuid | null;
  /** exerciseId, or `${exerciseId}:${machineProfileId}`; see seriesKey() in src/lib/ids.ts. */
  seriesKey: string;
  localDate: LocalDateString;
  /** Effective load (kg) after load-type rules, via effectiveLoadKg() in src/lib/analytics/load.ts. */
  effectiveLoadKg: number | null;
  /** Estimated 1RM (kg) via estimate1RM() in src/lib/analytics/e1rm.ts. null when not estimable. */
  e1rmKg: number | null;
}

export interface WorkoutSetRow extends WorkoutSetFields, WorkoutSetDerived, SyncMeta {
  id: Uuid;
}

export interface PersonalRecordRow {
  id: Uuid;
  exerciseId: Uuid;
  machineProfileId: Uuid | null;
  seriesKey: string;
  type: PrType;
  /** 0 for non-rep-specific types (E1RM, MAX_LOAD, ...); the rep count for REP_MAX. */
  reps: number;
  value: number;
  previousValue: number | null;
  setId: Uuid | null;
  workoutId: Uuid;
  achievedAt: IsoDateTime;
}

export interface ProfileRow {
  sex: Sex | null;
  birthDate: LocalDateString | null;
  heightCm: number | null;
  unitPreference: WeightUnit;
  effortScale: EffortScale;
  experience: ExperienceLevel | null;
  goal: TrainingGoal | null;
  e1rmFormula: E1rmFormula;
  timezone: string;
  defaultRestSec: number;
  insightsEnabled: boolean;
  onboardedAt: IsoDateTime | null;
}

export interface EntityTypeMap {
  exercise: { row: ExerciseRow; create: ExerciseCreate; patch: ExercisePatch };
  machineProfile: { row: MachineProfileRow; create: MachineProfileCreate; patch: MachineProfilePatch };
  bodyMetric: { row: BodyMetricRow; create: BodyMetricCreate; patch: BodyMetricPatch };
  template: { row: TemplateRow; create: TemplateCreate; patch: TemplatePatch };
  templateExercise: { row: TemplateExerciseRow; create: TemplateExerciseCreate; patch: TemplateExercisePatch };
  workout: { row: WorkoutRow; create: WorkoutCreate; patch: WorkoutPatch };
  workoutExercise: { row: WorkoutExerciseRow; create: WorkoutExerciseCreate; patch: WorkoutExercisePatch };
  workoutSet: { row: WorkoutSetRow; create: WorkoutSetCreate; patch: WorkoutSetPatch };
}
```

## 3. Sync protocol (`POST /api/sync`)

Owner of the implementation: **E1**. Shapes are frozen.

* **HLC** string: `<wallMs 15 digits>-<counter 5 hex>-<nodeId>` (e.g. `001791990000000-0000a-3f9c1b2d`). Fixed widths make plain string comparison the causal order. `""` (catalog / never written) sorts lowest. A client HLC more than `SYNC_MAX_CLOCK_SKEW_MS` (5 min) ahead of server time is clamped.
* **Merge** is last-write-wins **per field** by HLC, commutative and idempotent (shared `src/lib/sync/merge.ts`). A delete is the field write `deletedAt = <iso>`; undelete is `deletedAt = null` with a later HLC. Tombstones live `TOMBSTONE_TTL_DAYS` (90); after GC a client whose cursor is below `gcFloorVersion` gets `reset: true`.
* **Request**: `deviceId`, `cursor`, `clientHlc`, ≤ `SYNC_MAX_MUTATIONS` (200) mutations, validated by `syncRequestSchema`. Each mutation: `mutationId`, `entity`, `id`, `fields` (only writable fields + `deletedAt`), `fieldHlc` (exactly one HLC per field).
* **Server order of operations**: validate each mutation (shape, owner, references, catalog read-only) → a bad one gets `rejected` and a `SyncDeadLetter` row and never blocks the rest → lock the user's `SyncState` row (`FOR UPDATE`) → merge fields by HLC → every changed row gets the next per-user `version` → derive `workoutId/exerciseId/machineProfileId/seriesKey/localDate/effectiveLoadKg/e1rmKg` for sets → rebuild PRs for each affected `seriesKey` → return rows with `version > cursor`, ≤ `SYNC_MAX_PULL_ROWS` (1000) per page, ordered by version across all entities.
* A mutation referencing a parent that is missing for this user is `MISSING_REFERENCE`. Mutations in one batch are applied in `SYNC_ORDER` (parents first). Children of a tombstoned parent are tombstoned by the server (orphan rule).
* **Hard-delete order for GC / account deletion**: the schema uses `onDelete: NoAction` for cross-entity references (so deleting a `User` can cascade everywhere), which means garbage collection must delete children before parents (sets → workoutExercises → workouts; templateExercises → templates; then machineProfiles and exercises).
* **Triggers** (client): app start, `online`, `visibilitychange`, 1.5 s after a write, every 30 s while pending, manual. `navigator.locks` ensures one sync at a time. iOS has no Background Sync.

<!-- sig: src/contracts/sync.ts#SyncRequest,MutationResult,SyncResponse,SyncStatus,SyncReason,SyncResult,SyncedInfo -->
```ts
// from src/contracts/sync.ts
export type SyncRequest = z.infer<typeof syncRequestSchema>;

export interface MutationResult {
  mutationId: string;
  /** applied: changed the row. noop: valid, already merged (idempotent replay). rejected: refused and dead-lettered. */
  status: "applied" | "noop" | "rejected";
  reason?: RejectReason;
  message?: string;
}

export interface SyncResponse {
  /** One entry per request mutation, same order. A rejected mutation never blocks the rest. */
  results: MutationResult[];
  changes: SyncChanges;
  /** PRs rebuilt for the series touched by this request (drives the "new PR" toast after sync). */
  newPrs: PersonalRecordRow[];
  /** Send this as `cursor` next time. When hasMore, it is the version of the last returned row. */
  cursor: number;
  /** true = more pages are waiting: call again immediately with `cursor` and no mutations. */
  hasMore: boolean;
  /**
   * true = request.cursor was older than the server's gcFloorVersion (tombstones were collected): `changes` is empty;
   * the client must wipe its local synced tables (keeping the outbox) and restart from cursor 0.
   */
  reset: boolean;
  serverTime: IsoDateTime;
  serverHlc: Hlc;
}

export interface SyncStatus {
  state: SyncState;
  /** Outbox mutations not yet acknowledged by the server. */
  pendingCount: number;
  lastSyncedAt: IsoDateTime | null;
  lastError: string | null;
  /** Mutations the server rejected in the last sync (dead-lettered). */
  rejectedCount: number;
}

export type SyncReason = (typeof SYNC_REASONS)[number];

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  rejected: number;
  newPrs: PersonalRecordRow[];
  /** Set when ok is false. */
  error?: string;
  /** true when another sync was already running (navigator.locks) and this call did nothing. */
  skipped?: boolean;
}

/** Info passed to useOnSynced listeners after every completed sync that pulled or pushed something. */
export type SyncedInfo = Pick<SyncResult, "pushed" | "pulled" | "rejected" | "newPrs">;
```

Server entry point and route:

<!-- sig: src/server/sync/apply.ts#applyServerMutations! -->
```ts
// from src/server/sync/apply.ts
/**
 * Validate -> lock SyncState FOR UPDATE -> merge each mutation per field by HLC -> bump versions -> rebuild PRs -> pull changes.
 * `ctx` is the ONLY source of identity; the request body can never carry a userId.
 */
export async function applyServerMutations(_ctx: UserCtx, _request: SyncRequest): Promise<SyncResponse>;
```

`/api/sync` (route handler, **not** a Server Action: action ids change per deploy and an offline client on an old bundle would break) must wrap the handler with `withUserRoute`, parse the body with `syncRequestSchema`, and call `applyServerMutations(ctx, request)`.

## 4. Client repo and sync surface

Owner: **E1** implements, **E2/F/B** consume. Import from `@/client/repo` and `@/client/sync`. Rules every implementation honours are in the comments below; the key ones: one Dexie transaction per write (row + per-field HLC + outbox), soft deletes, `create` assigns UUIDv7, derived set columns mirrored locally.

<!-- sig: src/contracts/repo.ts#EntityRepo,ExerciseSearch,LastTimeEntry,Repo,UseLive -->
```ts
// from src/contracts/repo.ts
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
```

Sync surface (React side). **In Phase 0 these are safe no-ops** (so the shell can render before E1 lands); E1 replaces the bodies and keeps the signatures:

<!-- sig: src/client/sync/engine.ts#syncNow! -->
```ts
// from src/client/sync/engine.ts
/** Run one sync cycle now (push outbox -> pull changes). navigator.locks keeps it to one at a time. */
export async function syncNow(_reason: SyncReason = "manual"): Promise<SyncResult>;
```

<!-- sig: src/client/sync/hooks.ts#useSyncStatus!,useOnSynced! -->
```ts
// from src/client/sync/hooks.ts
/** Live sync status for SyncPip and "N changes waiting" UI. */
export function useSyncStatus(): SyncStatus;

/** Calls `callback` after every sync that pushed or pulled something (e.g. to show a PR toast). Stable identity not required. */
export function useOnSynced(_callback: (info: SyncedInfo) => void): void;
```

<!-- sig: src/contracts/sync-client.ts#SyncProviderProps -->
```ts
// from src/contracts/sync-client.ts
// Props of client sync components. FROZEN after Phase 0 (React-free so contracts stay pure).
export interface SyncProviderProps {
  /** The signed-in user's id (from the server session). Each user gets their own Dexie database. */
  userId: string;
}
```

`SyncProvider` (`src/client/sync/provider.tsx`) takes `SyncProviderProps & { children: ReactNode }`; it opens the per-user Dexie database `overload-<userId>` and starts the engine. It is already mounted in `src/app/(app)/layout.tsx`; stream B must keep it when replacing that layout, and `(workout)` must mount it too.

PR detection (pure, shared by server rebuild and the client's live toast):

<!-- sig: src/contracts/prs.ts#PrSetInput,PrCandidate,ComputeSeriesPrs,DetectNewPrs -->
```ts
// from src/contracts/prs.ts
/** The columns PR logic reads from a set (works on server rows and Dexie rows alike). */
export interface PrSetInput {
  id: string;
  workoutId: string;
  exerciseId: string;
  machineProfileId: string | null;
  seriesKey: string;
  setType: SetType;
  /** null = planned set: never counts. */
  completedAt: IsoDateTime | null;
  reps: number | null;
  effectiveLoadKg: number | null;
  e1rmKg: number | null;
}

/** The current best value of one PR type for one series. (type, reps) is unique per series; reps = 0 unless REP_MAX. */
export interface PrCandidate {
  seriesKey: string;
  exerciseId: string;
  machineProfileId: string | null;
  type: PrType;
  reps: number;
  value: number;
  setId: string | null;
  workoutId: string;
  achievedAt: IsoDateTime;
}

/**
 * Current PRs for ONE series from its completed sets. WARMUP and DROP sets never count; planned sets (completedAt null) never count.
 *  E1RM: best e1rmKg.  MAX_LOAD: best effectiveLoadKg (reps >= 1).  REP_MAX: best effectiveLoadKg for exactly N reps (one row per N).
 *  MAX_REPS: most reps in a set (bodyweight/no-load work).  MAX_SET_VOLUME: best effectiveLoadKg x reps.
 *  MAX_SESSION_VOLUME: best per-workout sum of effectiveLoadKg x reps.
 * Ties keep the EARLIEST achievement. Machine series never merge: the caller passes one seriesKey at a time.
 */
export type ComputeSeriesPrs = (sets: PrSetInput[]) => PrCandidate[];

/** PRs that `newSet` would set against `history` (strictly better than the prior best): drives the live PR toast. */
export type DetectNewPrs = (history: PrSetInput[], newSet: PrSetInput) => PrCandidate[];
```

## 5. Catalog

Owner: **C** (classification, `/api/catalog`, pages). Vendored data: `prisma/data/free-exercise-db.json` (876 rows, **Unlicense, verified**: GitHub reports SPDX `Unlicense`, text in `prisma/data/free-exercise-db.LICENSE.md`). Phase 0 seeds 30 hand-classified exercises (`prisma/seed/starter-exercises.ts`); C replaces `prisma/seed/catalog.ts` and keeps `seedCatalog(prisma)`.

<!-- sig: src/contracts/catalog.ts#FreeExerciseDbRow,ExerciseClassification,ClassifyExercise,CatalogResponse,catalogEtag! -->
```ts
// from src/contracts/catalog.ts
/** One row of free-exercise-db `exercises.json` (Unlicense; vendored at prisma/data/free-exercise-db.json). */
export interface FreeExerciseDbRow {
  /** e.g. "Barbell_Squat". Stable; the catalog UUIDv5 is derived from it (catalogExerciseId in src/lib/ids.ts). */
  id: string;
  name: string;
  force: "push" | "pull" | "static" | null;
  /** NOTE: the dataset says "expert" where our ExperienceLevel says ADVANCED. */
  level: "beginner" | "intermediate" | "expert";
  mechanic: "compound" | "isolation" | null;
  /** "barbell" | "dumbbell" | "machine" | "cable" | "body only" | "e-z curl bar" | "kettlebells" | "bands" | "medicine ball" | "exercise ball" | "foam roll" | "other" | null */
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** "strength" | "stretching" | "plyometrics" | "strongman" | "powerlifting" | "cardio" | "olympic weightlifting" */
  category: string;
  /** Paths relative to the dataset's exercises/ folder, e.g. "3_4_Sit-Up/0.jpg" (see src/lib/catalog-images.ts). */
  images: string[];
}

/** Everything needed to build an Exercise row for a catalog exercise. Produced by `classify()` (stream C). */
export interface ExerciseClassification {
  sourceId: string;
  slug: string;
  name: string;
  aliases: string[];
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking: TrackingType;
  /** Fraction of bodyweight moved (e.g. push-up ~0.64, pull-up 1.0); null when not a bodyweight-loaded movement. */
  bodyweightFactor: number | null;
  isUnilateral: boolean;
  mechanic: Mechanic | null;
  force: Force | null;
  level: ExperienceLevel | null;
  category: ExerciseCategory;
  /** Only the barbell/bodyweight variants that define the standard lift (e.g. SQUAT = back squat), else null. */
  standardLift: StandardLift | null;
  instructions: string[];
  images: string[];
  muscles: ExerciseMuscleEntry[];
}

/** Signature of prisma/seed/classify.ts (stream C). Pure. */
export type ClassifyExercise = (source: FreeExerciseDbRow) => ExerciseClassification;

/**
 * GET /api/catalog response. ETag: `W/"catalog-<version>"` (CatalogMeta.version); honour If-None-Match with 304.
 * Rows are global catalog exercises (isCustom: false, version 0, hlc "").
 */
export interface CatalogResponse {
  version: number;
  generatedAt: IsoDateTime;
  exercises: ExerciseRow[];
}

export function catalogEtag(version: number): string;
```

`GET /api/catalog`: ETag `catalogEtag(CatalogMeta.version)`, honour `If-None-Match` with 304. Images: `catalogImageUrl(path)` (`src/lib/catalog-images.ts`).

## 6. Analytics (`src/lib/analytics/**`, stream D)

Pure TypeScript. **Implemented in Phase 0** (frozen behaviour, tested): `estimate1RM` (`e1rm.ts`) and `effectiveLoadKg` (`load.ts`). **Stubs that throw `not implemented: <name>`** until D delivers: everything else. Exports must keep these exact types (a type-level test enforces it).

Effective load: `TOTAL` entry · `PER_IMPLEMENT` × 2 (× 1 if unilateral) · `PLATES_PER_SIDE` 2 × entry + base load · `STACK` entry · `BODYWEIGHT_PLUS` bodyweight × factor + added load (null without bodyweight) · `NONE` null.
e1RM: Epley with RIR folded in, `w·(1 + (reps + RIR)/30)`; one rep with no RIR is the weight itself; none when reps + RIR > 12; `confidence: "low"` above 10; Brzycki optional; rounded to 3 dp.

<!-- sig: src/contracts/analytics.ts#ExerciseMeta,MachineProfileMeta,SetFact,ProfileFact,BodyMetricFact,AnalyticsInput -->
```ts
// from src/contracts/analytics.ts
export interface ExerciseMeta {
  id: string;
  name: string;
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking: TrackingType;
  isUnilateral: boolean;
  bodyweightFactor: number | null;
  standardLift: StandardLift | null;
  mechanic: Mechanic | null;
  muscles: ExerciseMuscleEntry[];
}

export interface MachineProfileMeta {
  id: string;
  name: string;
  gymName: string | null;
  brand: string | null;
  exerciseId: string | null;
  labelUnit: WeightUnit | null;
  pinStepKg: number | null;
  baseLoadKg: number | null;
}

/** One COMPLETED, non-deleted set joined with the facts analytics needs (built by src/server/queries/facts.ts). */
export interface SetFact {
  id: string;
  workoutId: string;
  exerciseId: string;
  machineProfileId: string | null;
  seriesKey: string;
  localDate: LocalDateString;
  /** ISO instant the set was completed. */
  completedAt: string;
  setType: SetType;
  weightKg: number | null;
  effectiveLoadKg: number | null;
  reps: number | null;
  rir: number | null;
  durationSec: number | null;
  distanceM: number | null;
  e1rmKg: number | null;
  /** From the parent Workout: deload weeks are excluded from forecasts and stall detection. */
  isDeload: boolean;
  workoutBodyweightKg: number | null;
}

export interface ProfileFact {
  sex: Sex | null;
  birthDate: LocalDateString | null;
  ageYears: number | null;
  heightCm: number | null;
  experience: ExperienceLevel | null;
  goal: TrainingGoal | null;
  e1rmFormula: E1rmFormula;
  unitPreference: WeightUnit;
  timezone: string;
}

export interface BodyMetricFact {
  localDate: LocalDateString;
  weightKg: number | null;
  bodyFatPct: number | null;
  bodyFatMethod: BodyFatMethod | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
}

/** Everything the rule engine and the weekly-facts builder read. Assembled by loadAnalyticsInput() (frozen server query). */
export interface AnalyticsInput {
  /** The user's current local date (the "now" of every calculation; never read the system clock inside analytics). */
  today: LocalDateString;
  profile: ProfileFact;
  exercises: ExerciseMeta[];
  machineProfiles: MachineProfileMeta[];
  /** Completed sets over the lookback window (default 16 weeks), oldest first. */
  sets: SetFact[];
  /** Body metrics over the lookback window, oldest first. */
  bodyMetrics: BodyMetricFact[];
}
```

<!-- sig: src/contracts/analytics.ts#E1rmInput,E1rmEstimate,Estimate1RM,EffectiveLoadInput,EffectiveLoadKg -->
```ts
// from src/contracts/analytics.ts
export interface E1rmInput {
  weightKg: number;
  reps: number;
  /** Reps in reserve (folded into the estimate: reps + RIR). null/undefined = unknown = 0. */
  rir?: number | null;
  /** Default EPLEY. */
  formula?: E1rmFormula;
}

export interface E1rmEstimate {
  e1rmKg: number;
  /** "low" when reps + RIR > 10 (formulas degrade above 10; no estimate at all above 12). */
  confidence: "high" | "low";
  formula: E1rmFormula;
  /** reps + RIR actually used. */
  effectiveReps: number;
}

/**
 * Epley with RIR folded in: w * (1 + (reps + RIR) / 30). A single rep with no RIR returns the weight itself.
 * Returns null when reps + RIR > 12, reps < 1, or weight <= 0. Brzycki (36w / (37 - r)) is the alternative formula.
 * Result is rounded to 3 dp (the DB precision).
 */
export type Estimate1RM = (input: E1rmInput) => E1rmEstimate | null;

export interface EffectiveLoadInput {
  loadType: LoadType;
  /** The weight as entered, converted to kg. PLATES_PER_SIDE: the plates on ONE side. */
  weightKg: number | null;
  isUnilateral: boolean;
  /** The lifter's bodyweight at the time (Workout.bodyweightKg, else latest BodyMetric). Needed for BODYWEIGHT_PLUS. */
  bodyweightKg?: number | null;
  /** Exercise.bodyweightFactor; default 1 for BODYWEIGHT_PLUS. */
  bodyweightFactor?: number | null;
  /** MachineProfile.baseLoadKg: sled/carriage weight for PLATES_PER_SIDE. Default 0. */
  baseLoadKg?: number | null;
}

/**
 * TOTAL: weight. PER_IMPLEMENT: weight x 2 (x1 if unilateral). PLATES_PER_SIDE: 2 x weight + baseLoad.
 * STACK: the stack number. BODYWEIGHT_PLUS: bodyweight x factor + added weight (null if bodyweight unknown).
 * NONE: null. Result rounded to 3 dp.
 */
export type EffectiveLoadKg = (input: EffectiveLoadInput) => number | null;
```

<!-- sig: src/contracts/analytics.ts#VolumeBand,MuscleVolume,WeeklyVolumeInput,IsHardSet,WeeklyMuscleVolume -->
```ts
// from src/contracts/analytics.ts
export interface VolumeBand {
  /** Fractional sets per week. */
  low: number;
  high: number;
}

export interface MuscleVolume {
  muscle: Muscle;
  /** primary 1.0 + secondary 0.5 per hard set. Machine sets count fully. */
  fractionalSets: number;
  hardSets: number;
  directSets: number;
  indirectSets: number;
  band: VolumeBand;
  status: VolumeStatus;
}

export interface WeeklyVolumeInput {
  sets: SetFact[];
  exercises: ExerciseMeta[];
  /** Monday of the ISO week to summarize. Only sets with localDate in [weekStart, weekStart + 6] count. */
  weekStart: LocalDateString;
  goal: TrainingGoal | null;
}

/** A hard set is a completed set that is not a warm-up, with RIR <= 4 or RIR not recorded. */
export type IsHardSet = (set: Pick<SetFact, "setType" | "rir" | "reps" | "durationSec">) => boolean;

/** One entry per muscle that has any volume, ordered by fractionalSets descending. Volume does not depend on set order. */
export type WeeklyMuscleVolume = (input: WeeklyVolumeInput) => MuscleVolume[];
```

<!-- sig: src/contracts/analytics.ts#SessionPoint,SessionBestE1rm,ForecastInput,ForecastPoint,ForecastModel,ForecastResult,ForecastE1rm -->
```ts
// from src/contracts/analytics.ts
export interface SessionPoint {
  localDate: LocalDateString;
  /** Best e1RM of that session for the series, from working sets of 10 reps or fewer. */
  e1rmKg: number;
  seriesKey: string;
  isDeload: boolean;
}

/** Best e1RM per session (localDate) for ONE series, from non-warm-up, non-drop sets with <= 10 reps. Oldest first. */
export type SessionBestE1rm = (sets: SetFact[], opts?: { formula?: E1rmFormula }) => SessionPoint[];

export interface ForecastInput {
  /** Output of SessionBestE1rm for one series. */
  points: SessionPoint[];
  sex: Sex | null;
  experience: ExperienceLevel | null;
  standardLift: StandardLift | null;
  /** Date of the user's first logged workout, used to derive t0 when experience is unknown. */
  firstWorkoutDate: LocalDateString | null;
  today: LocalDateString;
  /** 1..12, default 12. */
  horizonWeeks?: number;
}

export interface ForecastPoint {
  localDate: LocalDateString;
  /** Median forecast e1RM (kg). */
  p50: number;
  /** 50% credible band. */
  low50: number;
  high50: number;
  /** 80% credible band. */
  low80: number;
  high80: number;
}

export interface ForecastModel {
  /** y = intercept + slope * ln(weeksSinceFirst + t0Weeks) */
  intercept: number;
  slope: number;
  t0Weeks: number;
  sigmaKg: number;
  /** Sessions actually used after excluding deloads, outliers (> 3 MAD) and pre-layoff data. */
  usedSessions: number;
  excluded: { deload: number; outliers: number; beforeLayoff: number };
}

export type ForecastResult =
  | { status: "ok"; points: ForecastPoint[]; model: ForecastModel }
  | { status: "insufficient"; reason: ForecastInsufficientReason; haveSessions: number; haveWeeks: number; needSessions: 6; needWeeks: 3 };

/**
 * Bayesian linear regression on ln(t + t0) with population priors by sex/lift/training age; noise sigma ~ 5% of e1RM.
 * Needs >= 6 sessions over >= 3 weeks. Horizon <= 12 weeks with 50% and 80% bands. Fit resets after a >= 4-week layoff.
 */
export type ForecastE1rm = (input: ForecastInput) => ForecastResult;
```

<!-- sig: src/contracts/analytics.ts#StallResult,DetectStall,ProgressionInput,ProgressionSuggestion,SuggestProgression -->
```ts
// from src/contracts/analytics.ts
export interface StallResult {
  stalled: boolean;
  /** Sessions considered (non-deload). */
  sessions: number;
  weeksSpanned: number;
  /** Relative change of recent best e1RM vs the earlier window; a change under ~5% is noise. */
  changePct: number | null;
}

/** A change smaller than ~5% is treated as noise (1RM test-retest CV is ~4%). */
export type DetectStall = (points: SessionPoint[], today: LocalDateString) => StallResult;

export interface ProgressionInput {
  /** Completed working sets of the series, most recent sessions last (at least the last 2 sessions). */
  sets: SetFact[];
  repMin: number;
  repMax: number;
  modality: Modality;
  /** Smallest load jump available (plates, or the machine's pin step). */
  incrementKg: number;
  /** Machine stack jumps can exceed 10%: when incrementKg / current load > 0.10, add reps first. */
  currentLoadKg: number;
}

export interface ProgressionSuggestion {
  kind: "add_load" | "add_reps" | "hold";
  nextLoadKg: number | null;
  nextRepTarget: number | null;
  rationale: string;
}

/** Double progression with the 2-for-2 rule: add load when the last set beats the target by 2 reps in two sessions in a row. */
export type SuggestProgression = (input: ProgressionInput) => ProgressionSuggestion;
```

<!-- sig: src/contracts/analytics.ts#Dots,IpfGl,Allometric,FfmiResult,Ffmi,NavyBodyFat,ResolvedBodyFat,ResolveBodyFat,TrendPoint,BodyweightTrend,StrengthPercentile,StrengthPercentileFn -->
```ts
// from src/contracts/analytics.ts
/** DOTS points. PREFER_NOT_TO_SAY -> averaged male/female coefficients. Clamps bodyweight (men 40-210, women 40-150). */
export type Dots = (input: { totalKg: number; bodyweightKg: number; sex: Sex }) => number | null;

/** IPF GL points (classic, raw by default). Check value: 90 kg bodyweight, 700 kg total, male -> 93.06. */
export type IpfGl = (input: { totalKg: number; bodyweightKg: number; sex: Sex; equipped?: boolean }) => number | null;

/** Allometric relative strength: lift / bodyweight^0.67. */
export type Allometric = (input: { liftKg: number; bodyweightKg: number }) => number;

export interface FfmiResult {
  leanMassKg: number;
  ffmi: number;
  normalizedFfmi: number;
  /** Because body-fat error carries through: FFMI at (bodyFat + 4) and (bodyFat - 4) percentage points. */
  range: { low: number; high: number };
}

/** LBM = BW(1 - BF%), FFMI = LBM / h^2, normalized = FFMI + 6.1 (1.8 - h). h in metres. */
export type Ffmi = (input: { weightKg: number; heightCm: number; bodyFatPct: number }) => FfmiResult;

/** US Navy tape estimate (cm, log10). Women need hipCm. Returns null when inputs are impossible (waist <= neck, ...). */
export type NavyBodyFat = (input: {
  sex: Extract<Sex, "MALE" | "FEMALE">;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number | null;
}) => number | null;

export interface ResolvedBodyFat {
  pct: number;
  method: BodyFatMethod;
  localDate: LocalDateString;
}

/** Source priority: DEXA > BIA/CALIPERS > NAVY_TAPE (computed from tape) > SCALE; the BMI estimate is NEVER returned. */
export type ResolveBodyFat = (metrics: BodyMetricFact[], profile: Pick<ProfileFact, "sex" | "heightCm">) => ResolvedBodyFat | null;

export interface TrendPoint {
  localDate: LocalDateString;
  trendKg: number;
}

/** Time-decayed moving average of bodyweight (default half-life 7 days), one point per input date. */
export type BodyweightTrend = (points: { localDate: LocalDateString; weightKg: number }[], opts?: { halfLifeDays?: number }) => TrendPoint[];

export interface StrengthPercentile {
  /** 0-100. */
  percentile: number;
  /** Always name the comparison population, e.g. "StrengthLevel, male, 85 kg bodyweight". */
  population: string;
  source: string;
}

/** Only barbell squat/bench/deadlift (and the standard lifts with norms). null for machines, unknown sex, PREFER_NOT_TO_SAY. */
export type StrengthPercentileFn = (input: {
  standardLift: StandardLift;
  e1rmKg: number;
  bodyweightKg: number;
  sex: Sex;
  ageYears: number | null;
}) => StrengthPercentile | null;
```

<!-- sig: src/contracts/analytics.ts#InsightEvidence,InsightCard,RunInsightRules,InsightRule -->
```ts
// from src/contracts/analytics.ts
export interface InsightEvidence {
  label: string;
  value: string | number;
  unit?: string;
}

export interface InsightCard {
  /** Stable id: `insight:<ruleId>` or `insight:<ruleId>:<subject>` (seriesKey or muscle). Used as a factRef. */
  id: string;
  ruleId: InsightRuleId;
  severity: InsightSeverity;
  title: string;
  body: string;
  evidence: InsightEvidence[];
  /** Keys of CITATIONS (src/lib/analytics/constants.ts), which map to docs/research.md. */
  citations: string[];
  subject?: { seriesKey?: string; exerciseId?: string; muscle?: Muscle };
}

/** Run all ten rules (each may emit 0..n cards). Deterministic: same input -> same cards in the same order. */
export type RunInsightRules = (input: AnalyticsInput) => InsightCard[];

/** One rule: a pure function from the shared input to cards. Rules are exported individually for unit tests. */
export type InsightRule = (input: AnalyticsInput) => InsightCard[];
```

File map: `volume.ts` (isHardSet, weeklyMuscleVolume) · `series.ts` (sessionBestE1rm) · `forecast.ts` (forecastE1rm) · `progression.ts` (detectStall, suggestProgression) · `scores.ts` (dots, ipfGl, allometric, ffmi, navyBodyFat, resolveBodyFat, bodyweightTrend) · `standards.ts` (strengthPercentile) · `insights/rules.ts` (`INSIGHT_RULES` per rule id + `runInsightRules`) · `facts.ts` (buildWeeklyFacts) · `constants.ts` (cited constants + `CITATIONS`, empty until D fills it from `docs/research.md`).

## 7. Insights facts and narrative

`InsightFacts` (Zod, `insightFactsSchema`) is the only data the narrative model sees; `InsightNarrative` is its structured output (≤ 3 actions, every section cites facts by id via `factRefs`). Fact ids: `lifter`, `training`, `body`, `volume:<MUSCLE>`, `lift:<seriesKey>`, `pr:<seriesKey>:<type>:<reps>`, `insight:<ruleId>[:<subject>]`. `collectFactIds(facts)` lists them. Stream G persists reports in `InsightReport` (`facts`, `narrative`, `factsHash`, token counts). `INSIGHTS_MODEL` selects the in-app model (default `claude-opus-5-5`).

<!-- sig: src/contracts/insights.ts#BuildWeeklyFacts,InsightReportRow,collectFactIds! -->
```ts
// from src/contracts/insights.ts
/** Signature of the pure facts builder (src/lib/analytics/facts.ts, stream D). */
export type BuildWeeklyFacts = (input: AnalyticsInput, opts: { weekStart: string }) => InsightFacts;

/** What /insights and the LatestInsightCard read (mapped from the InsightReport table by stream G). */
export interface InsightReportRow {
  id: string;
  weekStart: string;
  status: InsightStatus;
  trigger: InsightTrigger;
  factsVersion: number;
  facts: InsightFacts;
  factsHash: string;
  narrative: InsightNarrative | null;
  model: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  onDemandCount: number;
  generatedAt: IsoDateTime | null;
}

/** Every citable fact id in a facts bundle (for validating narrative factRefs). Implemented. */
export function collectFactIds(facts: InsightFacts): Set<string>;
```

## 8. Server data access (security boundary)

`src/server/auth/session.ts` (frozen). Every query, Server Action and sync function takes `ctx: UserCtx` and filters with `where: { userId: ctx.id }`; no Zod input schema may declare `userId` (an ESLint rule and a contracts test enforce it). `proxy.ts` only redirects early on cookie presence and is **not** a security check.

<!-- sig: src/server/auth/session.ts#UnauthorizedError,SessionInfo,getSessionInfo!,getUserCtx!,requireUser!,requireSessionInfo!,withUser!,withUserRoute! -->
```ts
// from src/server/auth/session.ts
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export interface SessionInfo {
  ctx: UserCtx;
  user: SessionUser;
}

/** The current session (ctx + user) or null. Never redirects. */
export async function getSessionInfo(requestHeaders?: Headers): Promise<SessionInfo | null>;

/** ctx or null. Never redirects. */
export async function getUserCtx(requestHeaders?: Headers): Promise<UserCtx | null>;

/** For pages/layouts/actions: signed-out users are redirected to /sign-in. */
export async function requireUser(): Promise<UserCtx>;

/** Like requireUser() but also returns the user's name/email/image (for the shell, avatar, settings). */
export async function requireSessionInfo(): Promise<SessionInfo>;

/** Wrap a server function so it always receives a verified ctx as its first argument. Throws UnauthorizedError when signed out. */
export function withUser<A extends unknown[], R>(fn: (ctx: UserCtx, ...args: A) => Promise<R>): (...args: A) => Promise<R>;

/** Wrap a route handler. Signed-out requests get `401 {"error":"unauthorized"}`; the handler never runs. */
export function withUserRoute<RouteCtx = unknown>(
  handler: (ctx: UserCtx, request: Request, routeCtx: RouteCtx) => Promise<Response>,
): (request: Request, routeCtx: RouteCtx) => Promise<Response>;
```

<!-- sig: src/server/auth/ctx.ts#UserCtx,mintUserCtx! -->
```ts
// from src/server/auth/ctx.ts
export type UserCtx = Readonly<{ id: string }> & { readonly [userCtxBrand]: "UserCtx" };

export function mintUserCtx(id: string): UserCtx;
```

`mintUserCtx` is for `session.ts`, the weekly cron (acting per user) and tests only.

Mappers (`src/server/mappers/index.ts`) turn Prisma rows into the Row types above (Decimal → number, Date → ISO, `@db.Date` → `YYYY-MM-DD`, no `userId`). Facts loaders (`src/server/queries/facts.ts`, implemented and frozen):

<!-- sig: src/server/queries/facts.ts#SetFactsBundle,loadSetFacts!,loadBodyFacts!,loadProfileFact!,loadAnalyticsInput! -->
```ts
// from src/server/queries/facts.ts
export interface SetFactsBundle {
  exercises: ExerciseMeta[];
  machineProfiles: MachineProfileMeta[];
  /** Oldest first (localDate, completedAt, position). */
  sets: SetFact[];
}

export async function loadSetFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<SetFactsBundle>;

export async function loadBodyFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<BodyMetricFact[]>;

export async function loadProfileFact(ctx: UserCtx, today: LocalDate): Promise<ProfileFact>;

/** Everything the rule engine and facts builder read, over `lookbackWeeks` ISO weeks ending today. */
export async function loadAnalyticsInput(
  ctx: UserCtx,
  opts: { today: LocalDate; lookbackWeeks?: number },
): Promise<AnalyticsInput>;
```

Server-only modules start with `import "server-only"` (it is aliased to a no-op under Vitest). Database access goes through `prisma` from `src/server/db.ts` (pooled `DATABASE_URL`, `@prisma/adapter-pg`, `attachDatabasePool`, lazy singleton). Migrations use `DIRECT_URL` via `prisma.config.ts`.

## 9. UI primitives (props frozen)

`HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` in `src/components/primitives/` (Server Components, styles in `src/styles/primitives.css`). Stream B may restyle but never change props.

<!-- sig: src/components/primitives/HardCard.tsx#HardCardProps -->
```ts
// from src/components/primitives/HardCard.tsx
/**
 * The signature surface: paper, square corners, a 6px vermilion hard shadow.
 * Props are FROZEN (CONTRACTS.md). `interactive` adds the press state (moves translate(2px,2px), shadow shrinks to 4px);
 * for a card that is a link, wrap/compose it with <Link> and keep this as the visual shell.
 */
export interface HardCardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default "div". */
  as?: "div" | "section" | "article" | "aside";
  /** Adds hover/press affordance (use when the whole card is clickable). Default false. */
  interactive?: boolean;
  /** Inner padding. Default true. */
  padded?: boolean;
  children?: ReactNode;
}
```

<!-- sig: src/components/primitives/SectionHeader.tsx#SectionHeaderProps,formatSectionIndex! -->
```ts
// from src/components/primitives/SectionHeader.tsx
/**
 * Numbered section header: "01/Progress" in Instrument Serif italic with a 2px vermilion underline rule.
 * Props are FROZEN (CONTRACTS.md). `index` renders as a zero-padded number followed by a vermilion slash
 * (index={1} -> "01/"); a string is shown as given. The index and slash are decorative (aria-hidden).
 */
export interface SectionHeaderProps {
  title: string;
  /** 1 -> "01", 12 -> "12"; strings pass through. Omit for an unnumbered header. */
  index?: number | string;
  /** Heading level. Default "h2". */
  as?: "h1" | "h2" | "h3";
  /** Right-aligned slot (a "View all" link, a filter, ...). */
  actions?: ReactNode;
  id?: string;
  className?: string;
}

export function formatSectionIndex(index: number | string): string;
```

<!-- sig: src/components/primitives/PageHeader.tsx#PageHeaderProps -->
```ts
// from src/components/primitives/PageHeader.tsx
/**
 * Page title block. Props are FROZEN (CONTRACTS.md).
 * `meta` renders as a meta line with vermilion slashes: ["Free weight", "Barbell"] -> "Free weight / Barbell".
 */
export interface PageHeaderProps {
  title: string;
  /** Meta line parts, joined with a vermilion slash. */
  meta?: string[];
  description?: ReactNode;
  /** Right-aligned buttons/links. */
  actions?: ReactNode;
  /** Heading level. Default "h1". */
  as?: "h1" | "h2";
  className?: string;
}
```

<!-- sig: src/components/primitives/EmptyState.tsx#EmptyStateProps -->
```ts
// from src/components/primitives/EmptyState.tsx
/**
 * Empty / zero-data state. Props are FROZEN (CONTRACTS.md). Always give the user a next step via `action`
 * (and say WHY it is empty in `description`).
 */
export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** A decorative icon (rendered in vermilion). */
  icon?: ReactNode;
  /** The call to action (a Button/Link). */
  action?: ReactNode;
  className?: string;
}
```

## 10. Design tokens, fonts, CSS ownership

* Themes `overload-paper` (light) and `overload-ink` (dark) in `src/styles/theme.css` with the plan's exact values; `--color-vermilion` (`#E4402B` / `#F26A55`) is a Tailwind color (`text-vermilion`, `border-vermilion`). Never use vermilion for small body text (3.7:1 on paper). Computed contrast (verified): ink on paper 16.5:1; paper on `#C8321F` 4.77:1; ink on `#F26A55` 6.1:1; provisional secondary/accent/semantic colors all ≥ 5.3:1. **Stream B finalizes** secondary (slate blue = cable) and accent (ochre = bodyweight) and validates the chart palette with the `dataviz` skill.
* The active theme is `localStorage["overload-theme"]` = `paper` | `ink` | absent (follow the system; installed PWAs default to ink). The inline `<head>` script is `themeInitScript` (`src/lib/theme.ts`); `applyTheme(choice)` switches at runtime.
* **Fonts (verified).** Instrument Serif (400, regular + italic) for display, Newsreader variable (`wght` 200–800, `opsz` 6–72) for body/UI, via `next/font/google` (`--font-instrument`, `--font-newsreader`; Tailwind `font-display`, `font-body`). **Newsreader HAS the `tnum` OpenType feature** (and `pnum`; no `lnum`/`onum` features exist because its default figures are already lining), checked on the exact latin woff2 files `next/font` serves. So use the `num` utility (`font-variant-numeric: tabular-nums lining-nums`) for every changing number. **Instrument Serif has no `tnum`**: use it only for static big stat numerals, never for live-updating numbers (timers, steppers, set inputs). `font-numeric` (Newsreader + monospace fallback) exists for set inputs if a glyph ever misbehaves.
* CSS partials, one per stream (`src/styles/globals.css` only imports them and is frozen): `theme.css`, `shell.css`, `motion.css`, `primitives.css` (B) · `auth.css` (A) · `catalog.css` (C) · `workout.css` (E2) · `progress.css` (F) · `insights.css` (G). Motion: `--page-out: .18s`, `--page-in: .36s`, `--ease-out: cubic-bezier(.22,1,.36,1)`; disable under `prefers-reduced-motion`.
* Root layout (frozen): `viewportFit: "cover"`, `appleWebApp` (`capable`, `black-translucent`), light/dark `themeColor`, `suppressHydrationWarning` + inline theme script, `SerwistProvider swUrl="/serwist/sw.js"` (disabled in `next dev`). Screens pad with `env(safe-area-inset-*)`.

## 11. Routes, ports, environment

Route groups: `(marketing)` `/`, `/learn/**` · `(auth)` · `(onboarding)` · `(workout)` `/workout` · `(app)` `/today`, `/exercises/**`, `/history/**`, `/templates/**`, `/progress/**`, `/insights/**`, `/settings/**` · `api`: `auth/[...all]`, `sync`, `catalog`, `cron/insights`, `health`. Phase 0 ships working: `/`, `/sign-in`, `/sign-up`, `/today` (stub), `/~offline`, `/api/auth/*`, `/api/health` (`?db=1` pings the database), `/serwist/sw.js`. `/api/sync`, `/api/catalog`, `/api/cron/insights` answer 501 until their stream lands.

Dev-server ports (`pnpm dev -p <port>`; `PORT` is also written by `pnpm db:branch`): A 3001 · B 3002 · C 3003 · D 3004 · E1 3005; Wave 2: E2 3001 · F 3002 · G 3003; integration 3000. Better Auth accepts `localhost:3000–3005` as origins in development.

Every variable is documented in `.env.example` (no real values anywhere). `vercel.json` schedules `/api/cron/insights` hourly (the handler picks the users whose local time is Monday 05:00, using `zonedTimeToUtc`).

## 12a. Server-originated writes and the PWA flag

Rows written **outside** `/api/sync` (onboarding's first `BodyMetric` in stream A, the body form in stream F) must still carry valid sync metadata or other devices would never pull them. Use `src/server/sync-meta.ts` (frozen): bump `SyncState.version` in the SAME transaction as the write and stamp every written field with the server HLC.

<!-- sig: src/server/sync-meta.ts#serverHlc!,bumpSyncVersion!,syncMixin! -->
```ts
// from src/server/sync-meta.ts
/** HLC string in the frozen format (see src/contracts/sync.ts). nodeId "server" marks server-originated writes. */
export function serverHlc(nowMs: number = Date.now(), counter = 0): string;

/** Next per-user version (creates the SyncState row on first use). Call inside prisma.$transaction. */
export async function bumpSyncVersion(tx: Prisma.TransactionClient, ctx: UserCtx): Promise<number>;

/** The sync mixin columns for a server-written row: `{ hlc, fieldHlc, version }` (deletedAt/createdAt/updatedAt are defaults). */
export function syncMixin(version: number, writtenFields: readonly string[], nowMs: number = Date.now());
```

Typical use: `prisma.$transaction(async (tx) => { const version = await bumpSyncVersion(tx, ctx); await tx.bodyMetric.create({ data: { id: newId(), userId: ctx.id, ...fields, ...syncMixin(version, Object.keys(fields)) } }); })` with `fields` validated by `bodyMetricFieldsSchema`.

PWA coordination (`src/lib/pwa.ts`, frozen): E2 calls `setWorkoutActive(true/false)` around a workout; B's shell posts `SKIP_WAITING` to a waiting service worker only when `isWorkoutActive()` is false.

<!-- sig: src/lib/pwa.ts#ACTIVE_WORKOUT_STORAGE_KEY,setWorkoutActive!,isWorkoutActive! -->
```ts
// from src/lib/pwa.ts
// PWA coordination flag between the workout screen (stream E2) and the service-worker update flow (stream B). PURE.
// While a workout is in progress E2 calls setWorkoutActive(true); B's shell only posts SKIP_WAITING to a waiting
// service worker when isWorkoutActive() is false ("a service-worker update never activates in the middle of a workout").
export const ACTIVE_WORKOUT_STORAGE_KEY = "overload-active-workout";

export function setWorkoutActive(active: boolean): void;

/** True while a workout is active. A flag older than `maxAgeMs` (default 12 h) is treated as stale (crashed tab). */
export function isWorkoutActive(maxAgeMs = 12 * 60 * 60 * 1000): boolean;
```

Scheduled jobs (`vercel.json`): `/api/cron/insights` hourly (stream G) and `/api/sync/gc` daily 04:00 (stream E1: tombstone cleanup past `TOMBSTONE_TTL_DAYS`, advancing `SyncState.gcFloorVersion`). Both require `Authorization: Bearer ${CRON_SECRET}`.

## 12. Phase 0 decisions worth knowing

* `SyncDeadLetter` table added (the plan mentions a dead-letter queue but Appendix A has no table).
* Cross-entity FKs are `onDelete: NoAction`; user-owned parent→child relations cascade. `PersonalRecord.setId` has no FK (sets can be garbage-collected independently).
* `rateLimit`, `passkey`, `session`, `account`, `verification` tables come from the Better Auth CLI (`pnpm auth:generate` regenerates a scratch copy at `prisma/auth.generated.prisma` to compare against the frozen schema).
* Serwist: `@serwist/turbopack` works with `next build` (Turbopack): service worker built by a force-static route handler at `/serwist/sw.js`, `Service-Worker-Allowed: /`. No `--webpack` fallback needed.
