# Stream FAV: favorite exercises and keyword search

Post-Wave-3 feature stream. Ownership is unrestricted for this stream (like W3): you may edit any file, including frozen ones, because the feature crosses the schema, the sync contracts, the repo, the server catalog and the UI. Keep each change minimal and list every frozen file you changed in your report.

## Goal

1. **Favorites.** A signed-in user can star any exercise (catalog or their own custom). Starred exercises are the first thing they see when picking an exercise while logging a workout or building a template, and the library can filter to them. Toggling must work offline (gym), so favorites are a synced entity.
2. **Keyword search.** Searching exercises matches every word of the query against the exercise's name, aliases, equipment, modality and muscles, understands common gym abbreviations, and ranks the best matches (and favorites) first. One pure implementation is shared by the offline picker (Dexie) and the server library so both return the same results.

## Read first

`CLAUDE.md`, `CONTRACTS.md`, `docs/PLAN.md` ("Offline sync", "Data model"), then the code you will extend:
- Sync: `src/contracts/entities.ts`, `src/contracts/sync.ts`, `src/contracts/repo.ts`, `src/lib/sync/**`, `src/server/sync/**`, `src/client/db/schema.ts` (Dexie `MIGRATIONS`), `src/client/repo/repo.ts`. Follow how `machineProfile` is wired end to end; it is the closest template.
- Search: `src/client/repo/repo.ts` (`exercises.search`, single substring today), `src/server/catalog/queries.ts` (`textFilter`, `listLibrary`), `src/components/exercises/**` (props-only list/card components), `src/components/workout/ExercisePicker.tsx`, `src/components/templates/TemplateEditor.tsx`.

## Part 1: favorites as a 9th synced entity

### Schema (additive only)
```prisma
model ExerciseFavorite {
  id         String    @id @db.Uuid   // deterministic: uuidv5(FAVORITE_NS, `${userId}:${exerciseId}`)
  userId     String
  exerciseId String    @db.Uuid
  position   String                   // fractional index (manual reorder later; append on create)
  hlc        String
  fieldHlc   Json      @default("{}")
  version    Int
  deletedAt  DateTime?                // unfavorite = tombstone; re-favorite = restore with a newer HLC
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  exercise   Exercise  @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  @@index([userId, version])
  @@index([userId, exerciseId])
}
```
Add the back-relations on `User` and `Exercise`. No unique constraint on `(userId, exerciseId)`: the deterministic id gives two offline devices the same row, so they converge through the normal merge instead of failing a batch.

**Migration without a database and without `migrate dev`:** write the SQL with
`pnpm exec prisma migrate diff --from-schema <(git show main:prisma/schema.prisma) --to-schema prisma/schema.prisma --script`
(or write main's schema to a temp file first) into `prisma/migrations/<timestamp>_exercise_favorites/migration.sql`. `pnpm db:diff` must pass afterwards, and `pnpm db:deploy` must apply it cleanly to your Neon branch.

### Contracts and engine
- `src/contracts/entities.ts`: Row / Create / Patch for `exerciseFavorite`. Client-writable: `exerciseId` (create only, immutable after), `position`, `deletedAt`. Server-derived/never accepted: `userId`, `version`, `hlc`, `fieldHlc`. Add it to the entity list and the reference table (`exerciseId` → `exercise`, required).
- `src/contracts/sync.ts`: `mutationFor("exerciseFavorite", …)`, and add it to `SyncResponse.changes`.
- `src/contracts/ids.ts` or `src/lib/ids.ts`: `favoriteId(userId, exerciseId)` (uuidv5 with a fixed namespace constant), tested.
- Server apply: an `exerciseFavorite` mutation is rejected (`forbidden` / `missing_parent`) unless the exercise is global or owned by the user, and unless the id equals `favoriteId(ctx.id, exerciseId)` (so a client cannot mint ids in another user's space). Pull returns favorites like the other entities. Tombstone GC covers it.
- **Old clients:** a browser running an older bundle must not break when a pull response contains `exerciseFavorite`. Check how the client parses `SyncResponse.changes` (unknown keys must be ignored, not rejected) and add a test proving it.
- Dexie: a new `MIGRATIONS` entry (next version) adding the `exerciseFavorite` table with indexes `id, exerciseId, deletedAt` (match the existing style). Existing local data must survive the upgrade (test it with fake-indexeddb: open v1 with data, upgrade, data intact).
- Repo (`src/contracts/repo.ts` + `src/client/repo/repo.ts`): `favorites: { list(): Promise<ExerciseRow[]>` (alive favorites' exercises, in position order) `; ids(): Promise<Set<string>>; isFavorite(exerciseId): Promise<boolean>; toggle(exerciseId): Promise<boolean /* now favorite */> }`. `toggle` creates with the deterministic id, or flips `deletedAt` (restore needs a newer HLC, which the repo already handles).

### UI
- **Star toggle** (`FavoriteButton`, client component, in `src/components/exercises/`): a 44px icon button, `aria-pressed`, label "Add {name} to favorites" / "Remove {name} from favorites", vermilion filled star when on, outline when off (icons and borders may be vermilion; never small text). Works offline through `repo.favorites.toggle`; a toast is not needed.
- Place it on: library cards (`ExerciseCard`), the exercise detail page header, and each row of the picker list. `ExerciseList` / `ExerciseCard` stay props-only: add optional `favoriteIds?: ReadonlySet<string>` and `renderAction?` (or `onToggleFavorite`) props; the stateful wiring lives in the caller.
- **Picker** (`ExercisePicker`, used by the active workout and the template editor): with an empty query, show **Favorites** first (all of them, position order), then **Recent**, then the modality tabs list. When there are no favorites, a one-line hint: "Star an exercise to pin it here." While searching, favorites rank above non-favorites with an equal match score.
- **Library** (`/exercises`): a "Favorites" filter chip (URL param `fav=1`, server-rendered like the other filters, works without JavaScript) and the star on each card. Server reads favorites with `where: { userId: ctx.id, deletedAt: null }`.

## Part 2: keyword search (one pure module)

Create `src/lib/search/exercise-search.ts` (pure: no react/next/server/client imports) with tests:

- `buildSearchIndex(exercises: SearchableExercise[]): SearchIndex` (precompute normalized fields once; the picker memoizes it per catalog version) and `searchExercises(index, query, opts?: { favoriteIds?: ReadonlySet<string>; limit?: number }): ExerciseHit[]` returning ids with scores, sorted.
- **Normalize:** lowercase, strip accents and punctuation, hyphens and slashes become spaces ("t-bar" → "t bar"), collapse whitespace.
- **Tokenize** the query; every token must match at least one field (AND). Light singular/plural folding ("curls" = "curl", "presses" = "press"; don't fold short words like "abs" incorrectly; test it).
- **Fields matched per exercise:** name words (word-prefix match: "incl" matches "incline"), aliases, equipment label ("dumbbell", "barbell", "cable", "smith machine", "kettlebell", "ez bar", "trap bar", "band", "bodyweight"), modality label ("free weight", "machine", "cable", "bodyweight"), primary and secondary muscle names (with human labels: "quads", "lats", "middle back", …).
- **Abbreviations and synonyms** (a cited-free constant map, tested): db→dumbbell, bb→barbell, kb→kettlebell, ez→ez bar, bw→bodyweight, ohp→overhead press (also matches "military press"), rdl→romanian deadlift, sldl→stiff legged deadlift, pec/pecs→chest, quad/quads→quadriceps, ham/hams/hammies→hamstrings, glute→glutes, tri/tris→triceps, bi/bis→biceps, delt/delts→shoulders, trap→traps, ab/abs/core→abdominals, calf→calves, lat→lats. Multi-word expansions must match as a phrase or as all their words.
- **Typos:** for tokens of 5+ characters with no exact/prefix hit, allow one edit (Damerau-Levenshtein ≤ 1) at a lower score ("dumbel" → dumbbell).
- **Scoring** (document the weights in the file): whole query is a prefix of the name > every token matches name words > alias match > primary-muscle match > equipment/modality match > secondary-muscle match > typo match; favorites get a boost that only breaks ties within a tier; then shorter name, then alphabetical. Deterministic.
- **Use it in both places:**
  - `repo.exercises.search` (Dexie): keep the existing filters (modality, equipment, muscle, standardLift, customOnly), replace the substring match and the ranking with `searchExercises`, pass `favoriteIds`.
  - `listLibrary` on the server: fetch the visible exercises (catalog + own custom, ~900 rows, with muscles) once, apply the same module in memory, then the existing facets and paging. Remove `textFilter`. Library and picker must agree on result sets for the same query and filters (add a test that runs one fixture list through both code paths).
- Golden tests on the real catalog JSON (`prisma/data/`): at least these, top result or top-3 as stated:
  - "incline db" → Incline Dumbbell Press (top 3)
  - "chest machine" → only MACHINE-modality exercises whose muscles include chest
  - "ohp" → an overhead or military press (top 3)
  - "rdl" → a Romanian deadlift (top 3)
  - "leg press" never returns Leg Curl
  - "bench" → bench press variants first
  - "dumbel curl" (typo) → a dumbbell curl (top 3)
  - "lats cable" → cable exercises training lats
  - empty query → unchanged behaviour (filters only)

## Tests and acceptance

Commit as you go (the checkpoint rule below). Before reporting done, all of these pass in your worktree:
- `pnpm check` (typecheck, lint, unit and DOM tests, including the new search, id, Dexie-upgrade, sync-merge and old-client tests). Add `exerciseFavorite` to the existing two-device convergence property test.
- `pnpm build`
- `pnpm db:diff` and `pnpm db:deploy` on your Neon branch
- `pnpm test:integration`: favoriting a catalog and an own custom exercise works; favoriting another user's custom exercise is rejected; a forged favorite id is rejected; user B's favorites never appear in user A's pull or library; extend the two-user isolation suite and `docs/security-checklist.md` with the new surface.
- e2e (`e2e/favorites.spec.ts`, users from `createUser`): star an exercise in the library → start a workout → it appears under Favorites in the picker; go offline, unstar it in the picker, go online → the library no longer shows it under `fav=1`; keyword search "incline db" in the picker finds Incline Dumbbell Press. Run the full suite with `E2E_PROD=1 pnpm test:e2e` on chromium and webkit-iphone, in the background, output saved to a file.
- axe: the star button has an accessible name and pressed state in both themes.

## Setup

`pnpm install --frozen-lockfile`, `pnpm db:branch FAV` (writes `PORT=3004` into this worktree's `.env.local`; use it for the dev server and e2e), `pnpm db:deploy && pnpm db:seed`. Never run e2e in the main checkout (the config refuses). Never print secrets.

## Checkpoint rule

Commit after every finished sub-step, at least every 30 minutes, even when tests are red: subject `wip(FAV): <what>`, body `Done: …` and `Next: …`. Never end a turn or start a long command with uncommitted changes. If resumed, read `git log --format='%h %s%n%b' main..HEAD` first and continue from the newest `Next:`. Do not merge, rebase onto main, push or deploy; the coordinator does that, and applies your migration to production before deploying.

## Report

What's done; test counts (unit, integration, e2e per project); the golden search results (query → top 3); every frozen file changed and why; anything not run or not verified.
