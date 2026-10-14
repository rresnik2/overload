# Stream F: Progress and Body

**Wave 2. Model: Sonnet 5.5. Dev-server port: 3002** (`pnpm dev -p 3002`; set `PORT=3002` for Playwright).

## Your goal

Show progression: per-exercise e1RM chart with forecast band, top set and volume, machine-series picker, weekly sets per muscle against landmark bands, calendar heatmap, body page (trend, body fat, circumferences, Navy calculator), PR board, plus the `WeekVolumeCard` and `BodyTrendCard` exports. Plan sections: "Analytics and insights engine", "Components" (ChartFrame and charts), Wave 2 table row F.

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.

## Setup (your own git worktree, branch `f/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch F                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3002
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/F-*.md`; colocated tests inside your paths are yours):

- `src/app/(app)/progress/**`
- `src/components/charts/**`
- `src/components/progress/**`
- `src/components/body/**`
- `src/server/queries/progress.*`
- `src/server/queries/body.*`
- `src/server/queries/prs.*`
- `src/server/actions/body.*`
- `src/styles/progress.css`
- `e2e/progress.spec.ts`

`pnpm ownership:check --stream=F` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- `requireUser()`, `requireSessionInfo()`, `withUser()`, `withUserRoute()`, branded `UserCtx` (`src/server/auth/session.ts`), `prisma` (`src/server/db.ts`), mappers, `src/lib/{units,dates,ids}.ts`.
- The four primitives `HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` (`src/components/primitives/*`) and the daisyUI themes in `src/styles/theme.css`.
- Your own CSS partial in `src/styles/` (already imported by `globals.css`).
- **Merged from Wave 1** (read their code, do not edit it): stream B's `src/components/ui/**` + shell + `/styleguide`; stream C's `src/components/exercises/**` + `/api/catalog`; stream D's analytics + fixtures + demo-user seed; stream E1's `repo`, `useLive`, `SyncProvider`, `syncNow`, `useOnSynced`, `useSyncStatus`, `/api/sync`; stream A's auth, onboarding and settings.
- All analytics functions from stream D (`src/lib/analytics/**`), the facts loaders (`src/server/queries/facts.ts`), stream D's fixtures and **demo user** (`pnpm exec tsx prisma/seed/fixtures.ts`, email `demo@overload.test`) for your e2e.
- The validated chart palette as CSS variables from stream B (`--chart-free-weight`, `--chart-machine`, `--chart-cable`, `--chart-bodyweight`, `--chart-forecast`, `--chart-pr`) and `Stat`, `Tabs`, `Sheet` components.
- Recharts 3.10 is installed (`<Area>` with a `[low, high]` `dataKey` draws a band). Server-originated writes use `bumpSyncVersion` + `syncMixin` (CONTRACTS.md 12a).

<!-- sig: src/contracts/analytics.ts#AnalyticsInput,SessionBestE1rm,ForecastE1rm,ForecastResult,WeeklyMuscleVolume,MuscleVolume,Ffmi,NavyBodyFat,ResolveBodyFat,BodyweightTrend -->
```ts
// from src/contracts/analytics.ts
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

/** Best e1RM per session (localDate) for ONE series, from non-warm-up, non-drop sets with <= 10 reps. Oldest first. */
export type SessionBestE1rm = (sets: SetFact[], opts?: { formula?: E1rmFormula }) => SessionPoint[];

/**
 * Bayesian linear regression on ln(t + t0) with population priors by sex/lift/training age; noise sigma ~ 5% of e1RM.
 * Needs >= 6 sessions over >= 3 weeks. Horizon <= 12 weeks with 50% and 80% bands. Fit resets after a >= 4-week layoff.
 */
export type ForecastE1rm = (input: ForecastInput) => ForecastResult;

export type ForecastResult =
  | { status: "ok"; points: ForecastPoint[]; model: ForecastModel }
  | { status: "insufficient"; reason: ForecastInsufficientReason; haveSessions: number; haveWeeks: number; needSessions: 6; needWeeks: 3 };

/** One entry per muscle that has any volume, ordered by fractionalSets descending. Volume does not depend on set order. */
export type WeeklyMuscleVolume = (input: WeeklyVolumeInput) => MuscleVolume[];

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

/** Source priority: DEXA > BIA/CALIPERS > NAVY_TAPE (computed from tape) > SCALE; the BMI estimate is NEVER returned. */
export type ResolveBodyFat = (metrics: BodyMetricFact[], profile: Pick<ProfileFact, "sex" | "heightCm">) => ResolvedBodyFat | null;

/** Time-decayed moving average of bodyweight (default half-life 7 days), one point per input date. */
export type BodyweightTrend = (points: { localDate: LocalDateString; weightKg: number }[], opts?: { halfLifeDays?: number }) => TrendPoint[];
```

<!-- sig: src/server/queries/facts.ts#loadSetFacts!,loadBodyFacts!,loadAnalyticsInput! -->
```ts
// from src/server/queries/facts.ts
export async function loadSetFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<SetFactsBundle>;

export async function loadBodyFacts(ctx: UserCtx, range: { from: LocalDate; to: LocalDate }): Promise<BodyMetricFact[]>;

/** Everything the rule engine and facts builder read, over `lookbackWeeks` ISO weeks ending today. */
export async function loadAnalyticsInput(
  ctx: UserCtx,
  opts: { today: LocalDate; lookbackWeeks?: number },
): Promise<AnalyticsInput>;
```

<!-- sig: src/contracts/entities.ts#PersonalRecordRow,BodyMetricRow -->
```ts
// from src/contracts/entities.ts
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

export interface BodyMetricRow extends BodyMetricFields, SyncMeta {
  id: Uuid;
}
```

<!-- sig: src/server/sync-meta.ts#bumpSyncVersion!,syncMixin! -->
```ts
// from src/server/sync-meta.ts
/** Next per-user version (creates the SyncState row on first use). Call inside prisma.$transaction. */
export async function bumpSyncVersion(tx: Prisma.TransactionClient, ctx: UserCtx): Promise<number>;

/** The sync mixin columns for a server-written row: `{ hlc, fieldHlc, version }` (deletedAt/createdAt/updatedAt are defaults). */
export function syncMixin(version: number, writtenFields: readonly string[], nowMs: number = Date.now());
```

## Deliverables

- `src/server/queries/progress.ts`, `body.ts`, `prs.ts` (each function takes `ctx: UserCtx`, filters by `ctx.id`, returns **plain data** via the mappers/analytics, no Decimal): per-series e1RM history, top set, volume, forecast (via `sessionBestE1rm` + `forecastE1rm`), weekly sets per muscle (`weeklyMuscleVolume`), calendar heatmap data (by `localDate`), body trend (`bodyweightTrend`), body fat resolution (`resolveBodyFat`), FFMI, PR board (`PersonalRecord` rows via `personalRecordToRow`). Mapper/query unit tests on D's fixtures.
- `src/server/actions/body.ts` (Server Actions, online forms only): add/edit/delete a `BodyMetric` (strict Zod from `bodyMetricFieldsSchema`, **no userId**, `ctx` from `requireUser`), written with `bumpSyncVersion` + `syncMixin` in one transaction so other devices pull it. The Navy calculator (`navyBodyFat`) lives in the form.
- Pages: `(app)/progress` (overview), `progress/[exerciseId]` (e1RM chart with the forecast: dashed line, 80% band at 12% opacity, 50% band at 22%; top set and volume charts; **machine-series picker** so each `seriesKey` / machine profile is its own chart and machine lifts are never merged or converted; PR markers as vermilion stars; "needs 6 sessions" low-data state from `ForecastResult.insufficient`), `progress/body`, `progress/prs`. DOTS/percentiles only for barbell squat/bench/deadlift, never machines.
- `src/components/charts/**`: `ChartFrame` (loading, empty, low-data states; **every chart has an accessible table fallback** and an `aria-describedby` text summary) and the charts (Recharts, client components taking plain props). `src/components/progress/**` and `src/components/body/**`: presentational components. Exported cards for Wave 3's `/today`: `WeekVolumeCard` and `BodyTrendCard` (async Server Components that take `ctx` or load via `requireUser`, and handle empty data with `EmptyState`).
- Styles only in `src/styles/progress.css` (use the chart CSS variables, both themes).

**Notes.** Weeks are ISO (Monday-Sunday) and grouped by `Workout.localDate`. Forecasts are shown in percent-consistent terms with the 50% and 80% bands only when the model returned `status: "ok"`. Never extrapolate beyond 12 weeks.

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass; `pnpm ownership:check --stream=F` passes.
2. Unit tests: queries/mappers on fixtures (no Decimal in outputs, no `userId`, machine series separate, deload excluded from forecast input), body action schema rejects an injected `userId`.
3. `PORT=3002 pnpm exec playwright test e2e/progress.spec.ts --project=chromium` as the **demo user** (seed it first): charts render, the forecast band is present for a long series and absent with the "needs 6 sessions" state for a short one, the two leg-press series are separate in the picker, every chart has its table fallback (axe: no violations on `/progress` pages in both themes).
4. `pnpm test:integration`: the progress queries only return the caller's data (two users).

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `src/lib/analytics/**` (D), `src/server/queries/facts.ts` (frozen), `src/client/**` (E1), `src/components/ui/**` (B).

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/F-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=F` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).
