# Security checklist (stream W3)

The model: **the user comes only from the session** (`requireUser()` / `withUser()` / `withUserRoute()` mint a branded `UserCtx`), every query filters `where: { userId: ctx.id }`, no schema accepts `userId`, and `proxy.ts` is only an early redirect, never the check.

Two suites prove it with two real users, A (the attacker) and B (the victim):

- **Logic suite**: `src/server/isolation.integration.test.ts` (`pnpm test:integration`, real Postgres). B owns one row of every synced entity, PRs, an insight report and a profile, with secret strings in the names and notes. A calls the surface with B's ids; every call must be rejected (`NOT_OWNER`, `MISSING_REFERENCE`, `ok:false`, `null`) or return nothing of B's (no id, no secret string, no series key, no user id anywhere in the result). A final test compares a JSON snapshot of every table row B owns, taken before the attacks, with one taken after: **byte-identical**.
- **HTTP suite**: `e2e/isolation/*.spec.ts` (`pnpm test:e2e`, chromium and webkit-iphone, against a running server). Same attack through the real route handlers, pages and Better Auth endpoints.

## Surfaces and the test that covers each

| Surface | What A tries with B's ids | Covered by |
|---|---|---|
| `POST /api/sync` (route handler, `withUserRoute`) | update, tombstone and undelete of each of the 9 entities (exercise, machineProfile, bodyMetric, template, templateExercise, workout, workoutExercise, workoutSet, exerciseFavorite) | logic: `sync: ... NOT_OWNER` (one test per entity); HTTP: `A's sync pushes against B's ids` |
| sync references | creating children whose parent, exercise or machine profile is B's (10 combinations, including starring B's custom exercise) | logic: `MISSING_REFERENCE for every child entity` |
| sync favorite ids (`exerciseFavorite`) | a random id, an id in B's id space (`favoriteId(B, ...)`), B's actual favorite id, and re-pointing A's own favorite at another exercise: all rejected (`INVALID_SHAPE` for an id that is not `favoriteId(ctx.id, exerciseId)`, `NOT_OWNER` for B's row); starring B's custom exercise is `MISSING_REFERENCE`; A can star the catalog and A's own custom exercises | logic: `favorites: the deterministic id is checked...`; `src/server/sync/rules.test.ts`; `src/server/sync/apply.integration.test.ts` (exerciseFavorite) |
| favorites reads (`listFavoriteExerciseIds`, favorites-only `listLibrary`, `pullChanges`, export) | B's stars in A's pull, A's favorite ids, A's `fav=1` library (also searched by B's secret exercise name) and A's export: none | logic: `favorites: ... B's stars are invisible to A`, `A's account export lists A's starred exercises only` |
| sync id reuse | a full valid create that reuses B's id | logic: `a create that reuses B's id` |
| sync forbidden fields | `userId`, `version`, `hlc`, `fieldHlc`, `effectiveLoadKg`, `e1rmKg`, `seriesKey`, `workoutId` in a mutation body: dead-lettered to the caller only | logic: `forbidden fields ...`; contracts tests (strict schemas) |
| sync pull | A's cursor-0 pull must not contain B's rows | logic: `pull: A's cursor-0 pull`; HTTP: `A's sync pull, catalog and export` |
| PR rebuild | `rebuildSeriesPrs(ctxA, B's series keys)` leaves B's `PersonalRecord` rows alone | logic: same test |
| `GET /api/catalog` | the shared catalog has no custom exercises (B's custom exercise never appears) | logic: `library and catalog`; HTTP: `A's sync pull, catalog and export` |
| `loadExerciseProgress` (`/progress/[exerciseId]`) | B's custom exercise id, with and without B's series key: `null` (404) | logic: `progress, exercise detail...`; HTTP: `A cannot open B's records by URL` |
| `loadProgressOverview`, `loadPrBoard`, `loadBodyView` | nothing of B's in the results | logic: `progress, exercise detail, PR board, body...` |
| `getExerciseDetail` (`/exercises/[id]`), `listLibrary` | B's custom exercise by id and by exact name: not found / no hit | logic; HTTP (404) |
| `loadSetFacts`, `loadBodyFacts`, `loadAnalyticsInput` | no B rows | logic |
| Insight reports: `listReports`, `latestReport`, `prismaReportStore.find`, `loadInsightsOverview`, `/insights/[week]` | A sees none of B's; `finish(ctxA, B's report id)` throws; `/insights/<B's week>` is 404 for A | logic: `insight reports...`; HTTP |
| Account export: `exportAccountData`, `GET /settings/account/export` | A's export holds only A's data; B's holds B's (control) | logic: `A's account export`; HTTP |
| Server Action logic: `editBodyMetric`, `deleteBodyMetric`, `addBodyMetric` | B's row id, and an injected `userId` | logic: `body metrics: edit and delete...` |
| Server Actions: `updateProfile`, `completeOnboarding` | injected `userId`: rejected, B's profile untouched | logic: `profile and onboarding...`; `e2e/auth.spec.ts` (userId injected into the profile action) |
| Account deletion: `deleteAccount` | a session that is not the caller's is refused; deleting user C removes only C (rows cascade, the shared catalog survives) | logic: `account deletion...`; `e2e/auth.spec.ts` (typed phrase and password) |
| Pages by URL: `/history/[id]`, `/templates/[id]` (Dexie, per-user database) | B's workout and template ids: "not found", no secrets in the HTML | HTTP: `A cannot open B's records by URL` |
| Better Auth: `revoke-session`, `passkey/delete-passkey`, `passkey/update-passkey`, `list-sessions`, `revoke-other-sessions` | A uses B's session token and passkey id: B's session row and passkey survive, A's session list excludes B's token | HTTP: `Better Auth endpoints are scoped to the caller` |
| Shared device | A signs out (new Sign out button), B signs in on the same browser: no A workout, no active workout, no A history | HTTP: `device-switch.spec.ts` |
| Anonymous callers | `/api/sync`, `/api/catalog`, `/api/sync/gc`, `/api/cron/insights` answer 401; the export and every app page redirect to `/sign-in` | HTTP: `anonymous callers get 401...` |
| Cron routes | `Authorization: Bearer ${CRON_SECRET}` required (timing-safe compare, minimum 16 characters); wrong secret is 401 | HTTP (above); `src/server/insights/*.test.ts` |
| `/api/auth/test-mailbox` | 404 in production | `e2e/_support/db.ts` probe (production runs depend on it) |
| Tombstone GC (`collectTombstones`) | per-user transactions, filters on each user's own rows; old unstarred favorites are collected, live ones never; a run scoped to `userIds` leaves other users' tombstones, dead letters and gc floor alone; PR rows are rebuilt, never cascaded away | `src/server/sync/apply.integration.test.ts` (garbage collection, exerciseFavorite) |

## Review notes

- **Result of the isolation suites**: no leak found. Every query, action and sync path filters by `ctx.id`; ownership of sync rows and references is checked inside the transaction under the per-user `SyncState` lock.
- **`/security-review` of the whole W3 diff**: no HIGH or MEDIUM findings. The only changes with a security angle are small: the `redirectIfNotOnboarded(ctx)` guard in the `(app)` and `(workout)` layouts (a redirect, not an authorization check), a Sign out button that calls Better Auth's `signOut` and redirects to `/sign-in`, the `/today` page (all cards take the session `ctx`), `repo.sets.forSeries` (client-side Dexie read, scoped to the signed-in user's own database), corrected citation links (static, `https:` only), and test/tooling files (the Lighthouse runner signs in with the documented test-only demo password against a local server and never touches production).
- **Known and accepted**: Dexie data stays on the device after sign-out (per-user database, so another person signing in never sees it; the next sign-in as the same user syncs pending changes). Signing out does not erase local data: on a shared phone, use the browser's "clear site data". This is the offline-first trade-off in `docs/PLAN.md`.
