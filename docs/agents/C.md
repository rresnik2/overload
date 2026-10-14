# Stream C: Exercise catalog

**Wave 1. Model: Sonnet 5.5. Dev-server port: 3003** (`pnpm dev -p 3003`; set `PORT=3003` for Playwright).

## Your goal

Classify the whole free-exercise-db dataset (876 rows, Unlicense) into the schema's modality, equipment, load type, unilateral, bodyweight factor and standard-lift fields, seed it with stable ids, serve it at `/api/catalog`, and build the exercise library and detail pages. Plan sections: "Data model" (Modality, LoadType), Wave 1 table row C.

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.

## Setup (your own git worktree, branch `c/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch C                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3003
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/C-*.md`; colocated tests inside your paths are yours):

- `prisma/seed/catalog.*`
- `prisma/seed/classify.*`
- `prisma/seed/overrides.json`
- `prisma/seed/starter-exercises.*`
- `src/app/api/catalog/**`
- `src/app/(app)/exercises/**`
- `src/components/exercises/**`
- `src/server/catalog/**`
- `src/styles/catalog.css`
- `e2e/catalog.spec.ts`
Not yours (inside the globs above): `src/app/(app)/exercises/new/**`, `src/app/(app)/exercises/\[id\]/edit/**`.

`pnpm ownership:check --stream=C` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- `requireUser()`, `requireSessionInfo()`, `withUser()`, `withUserRoute()`, branded `UserCtx` (`src/server/auth/session.ts`), `prisma` (`src/server/db.ts`), mappers, `src/lib/{units,dates,ids}.ts`.
- The four primitives `HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` (`src/components/primitives/*`) and the daisyUI themes in `src/styles/theme.css`.
- Your own CSS partial in `src/styles/` (already imported by `globals.css`).
- Vendored dataset: `prisma/data/free-exercise-db.json` (+ `free-exercise-db.LICENSE.md`; license verified as the Unlicense). `loadSourceRows()` in `prisma/seed/catalog.ts`.
- Phase 0 seed of 30 hand-classified exercises: `prisma/seed/starter-exercises.ts` (a good start for your hand-labelled test set; you own these files now).
- `catalogExerciseId(sourceId)` (stable UUIDv5, namespace frozen), `slugify`, `catalogImageUrl`.
- `ExerciseRow`, `CatalogResponse`, `catalogEtag` in contracts; `exerciseToRow` mapper.
- The Better Auth session guard for pages: `requireUser()`. `/api/catalog` should also require a session (`withUserRoute`).

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

<!-- sig: src/contracts/entities.ts#ExerciseRow -->
```ts
// from src/contracts/entities.ts
export interface ExerciseRow extends ExerciseFields, SyncMeta {
  id: Uuid;
  /** false = global catalog row (read-only, version 0); true = the user's own custom exercise. */
  isCustom: boolean;
  /** free-exercise-db id for catalog rows, else null. */
  sourceId: string | null;
}
```

<!-- sig: src/lib/ids.ts#catalogExerciseId!,seriesKey! -->
```ts
// from src/lib/ids.ts
/** Stable catalog id for a free-exercise-db `id` (e.g. "Barbell_Squat"). */
export function catalogExerciseId(sourceId: string): string;

/**
 * Progression series key. Free-weight/bodyweight exercises: just the exerciseId.
 * Machine/cable exercises logged against a MachineProfile: `${exerciseId}:${machineProfileId}`
 * so each gym/brand/machine progresses separately and is never merged or converted.
 */
export function seriesKey(exerciseId: string, machineProfileId?: string | null): string;
```

## Deliverables

- `prisma/seed/classify.ts`: `export const classify: ClassifyExercise` (pure) that classifies **every** source row. Rules to implement (and unit test): modality (`FREE_WEIGHT | MACHINE | CABLE | BODYWEIGHT | BAND | OTHER`) from the dataset's `equipment` + name keywords; finer `equipment` (barbell, dumbbell, kettlebell, EZ bar, trap bar, Smith machine, selectorized vs plate-loaded machine, cable, bodyweight, band, exercise ball, foam roll, medicine ball, plate, other); `loadType` (barbell/EZ/trap bar/Smith `TOTAL`; dumbbell/kettlebell `PER_IMPLEMENT` unless a single implement is held or the name says one-arm/single (then `isUnilateral` true or `TOTAL`); plate-loaded machines `PLATES_PER_SIDE`; selectorized machines and cables `STACK`; weighted-capable bodyweight moves `BODYWEIGHT_PLUS` with `bodyweightFactor` (pull-up/chin-up/dip 1.0, push-up ~0.64, etc.); everything else `NONE`); `tracking` (`LOAD_REPS` default, `REPS` for unloaded bodyweight, `DURATION` for stretches/planks, `DISTANCE_DURATION` for cardio); `isUnilateral`; `standardLift` only for the barbell/bodyweight variant that defines it (SQUAT, BENCH_PRESS, DEADLIFT, OVERHEAD_PRESS, BARBELL_ROW, PULL_UP, DIP: never a machine); muscles (primary/secondary from the dataset); `level` (dataset `expert` -> `ADVANCED`). **Machine and free-weight exercises must never be mixed.** Hand overrides go in `prisma/seed/overrides.json` (`ClassificationOverrides`).
- `prisma/seed/catalog.ts`: keep `export async function seedCatalog(prisma)`; seed all rows through `classify` + overrides with ids from `catalogExerciseId(sourceId)`; idempotent upserts (`hlc: ""`, `version: 0`, `userId: null`); replace `ExerciseMuscle` rows per exercise; bump `CatalogMeta.version` only when content actually changed. Reseeding keeps every id. (`prisma/seed/index.ts` is frozen and already calls `seedCatalog`.)
- Tests: **every source row is classified** (no throws, valid enums, >= 1 primary muscle where the dataset has one); **40 hand-labelled exercises** (`prisma/seed/classify.test.ts`, a table you label by reading the exercise) all match; machine vs free-weight invariants; ids unique and stable (snapshot a few); reseeding twice yields identical ids and row counts (integration test on your Neon branch).
- `GET /api/catalog` (`src/app/api/catalog/route.ts`): `CatalogResponse` of all global exercises with muscles (use `exerciseToRow`), ETag `catalogEtag(version)`, `If-None-Match` -> 304, `Cache-Control: private, max-age=0, must-revalidate`. Require a session.
- `src/server/catalog/**`: queries for the library (filter by modality, equipment, muscle, text search; includes the user's custom exercises) and the detail page (instructions, images, muscles, which series exist). Always filter custom exercises by `ctx.id`; catalog rows are `userId: null`.
- Pages (Server Components): `(app)/exercises` (library with tabs **Free weight / Machine / Cable / Bodyweight**, equipment and muscle filters, search, URL-driven state so it works without JS and is shareable) and `(app)/exercises/[id]` (detail). `new` and `[id]/edit` belong to E2.
- `src/components/exercises/**`: `ExerciseCard`, `ExerciseList`, `ModalityBadge`, `MuscleChips`, `ExerciseFilters`, `ExerciseDetail`... all take **props only** (no data fetching, no server imports) so E2 can reuse them in its picker. Export a documented props interface per component. Use daisyUI classes and the primitives (stream B's `ui` components are not merged yet; Wave 3 may swap).
- Meta lines use the vermilion slash: `Free weight / Barbell` (the `PageHeader` `meta` prop).

**Notes.** The dataset `equipment` values are: body only, machine, other, foam roll, kettlebells, dumbbell, cable, barbell, bands, medicine ball, exercise ball, e-z curl bar, null. `force` push/pull/static/null, `mechanic` compound/isolation/null, `category` strength/stretching/plyometrics/strongman/powerlifting/cardio/olympic weightlifting. Images are paths like `Barbell_Squat/0.jpg`; render with `catalogImageUrl()` and `next/image` (`raw.githubusercontent.com` is allowed in `next.config.ts`) or a plain `<img>` with explicit width/height.

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass; `pnpm ownership:check --stream=C` passes.
2. `pnpm test` covers the classifier (all rows + 40 hand labels + invariants).
3. On your Neon branch: `pnpm db:seed` twice; `pnpm test:integration` shows identical ids/counts after the second run; SQL spot check that the catalog count equals the dataset count (876) and no catalog exercise has `modality = FREE_WEIGHT` with a machine `equipment`.
4. `PORT=3003 pnpm exec playwright test e2e/catalog.spec.ts --project=chromium`: sign up (Phase 0 form), open `/exercises`, switch tabs, filter, search, open a detail page; `/api/catalog` returns 200 then 304 with `If-None-Match`.
5. Report the classification histogram (counts per modality / loadType / standardLift) and list every row you hand-overrode.

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `prisma/seed/index.ts` and `prisma/data/**` (frozen), `src/app/(app)/exercises/new/**` and `src/app/(app)/exercises/[id]/edit/**` (E2), `src/app/(app)/layout.tsx` (B).

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/C-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=C` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).
