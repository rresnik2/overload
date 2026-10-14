# Stream D: Analytics core and fixtures

**Wave 1. Model: Sonnet 5.5. Dev-server port: 3004** (`pnpm dev -p 3004`; set `PORT=3004` for Playwright).

## Your goal

Implement every analytics function and all ten insight rules in `src/lib/analytics/**` (pure TypeScript, evidence-based, cited), plus the fixture-history generator and the demo-user seed. Plan sections: "Analytics and insights engine", Wave 1 table row D; the evidence is `docs/research.md` (formulas, coefficients and check values are there; copy them exactly).

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.

## Setup (your own git worktree, branch `d/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch D                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3004
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/D-*.md`; colocated tests inside your paths are yours):

- `src/lib/analytics/**`
- `src/lib/fixtures/**`
- `prisma/seed/fixtures.*`

`pnpm ownership:check --stream=D` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- The frozen contract types for every function (below) and `InsightFacts` / `InsightNarrative` (`src/contracts/insights.ts`).
- Already implemented and tested in Phase 0 (do not change the maths): `estimate1RM` (`e1rm.ts`) and `effectiveLoadKg` (`load.ts`), constants in `constants.ts` (extend it; every constant gets a citation key).
- Stubs that throw `not implemented: <name>` for everything else, one file each (see the file map in CONTRACTS.md section 6). Keep every export name and type (`signatures.test.ts` enforces the types).
- `src/lib/dates.ts` (ISO weeks, `eachWeekStart`, ...), `src/lib/units.ts`, `src/lib/ids.ts`.
- `fast-check` and `vitest` are installed. `pnpm test:analytics-coverage` enforces >= 95% lines/functions on `src/lib/analytics/**`.

<!-- sig: src/contracts/analytics.ts#SetFact,AnalyticsInput,Estimate1RM,EffectiveLoadKg,IsHardSet,WeeklyMuscleVolume,SessionBestE1rm,ForecastE1rm,DetectStall,SuggestProgression -->
```ts
// from src/contracts/analytics.ts
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

/**
 * Epley with RIR folded in: w * (1 + (reps + RIR) / 30). A single rep with no RIR returns the weight itself.
 * Returns null when reps + RIR > 12, reps < 1, or weight <= 0. Brzycki (36w / (37 - r)) is the alternative formula.
 * Result is rounded to 3 dp (the DB precision).
 */
export type Estimate1RM = (input: E1rmInput) => E1rmEstimate | null;

/**
 * TOTAL: weight. PER_IMPLEMENT: weight x 2 (x1 if unilateral). PLATES_PER_SIDE: 2 x weight + baseLoad.
 * STACK: the stack number. BODYWEIGHT_PLUS: bodyweight x factor + added weight (null if bodyweight unknown).
 * NONE: null. Result rounded to 3 dp.
 */
export type EffectiveLoadKg = (input: EffectiveLoadInput) => number | null;

/** A hard set is a completed set that is not a warm-up, with RIR <= 4 or RIR not recorded. */
export type IsHardSet = (set: Pick<SetFact, "setType" | "rir" | "reps" | "durationSec">) => boolean;

/** One entry per muscle that has any volume, ordered by fractionalSets descending. Volume does not depend on set order. */
export type WeeklyMuscleVolume = (input: WeeklyVolumeInput) => MuscleVolume[];

/** Best e1RM per session (localDate) for ONE series, from non-warm-up, non-drop sets with <= 10 reps. Oldest first. */
export type SessionBestE1rm = (sets: SetFact[], opts?: { formula?: E1rmFormula }) => SessionPoint[];

/**
 * Bayesian linear regression on ln(t + t0) with population priors by sex/lift/training age; noise sigma ~ 5% of e1RM.
 * Needs >= 6 sessions over >= 3 weeks. Horizon <= 12 weeks with 50% and 80% bands. Fit resets after a >= 4-week layoff.
 */
export type ForecastE1rm = (input: ForecastInput) => ForecastResult;

/** A change smaller than ~5% is treated as noise (1RM test-retest CV is ~4%). */
export type DetectStall = (points: SessionPoint[], today: LocalDateString) => StallResult;

/** Double progression with the 2-for-2 rule: add load when the last set beats the target by 2 reps in two sessions in a row. */
export type SuggestProgression = (input: ProgressionInput) => ProgressionSuggestion;
```

<!-- sig: src/contracts/analytics.ts#Dots,IpfGl,Allometric,Ffmi,NavyBodyFat,ResolveBodyFat,BodyweightTrend,StrengthPercentileFn,RunInsightRules,InsightRule,InsightCard -->
```ts
// from src/contracts/analytics.ts
/** DOTS points. PREFER_NOT_TO_SAY -> averaged male/female coefficients. Clamps bodyweight (men 40-210, women 40-150). */
export type Dots = (input: { totalKg: number; bodyweightKg: number; sex: Sex }) => number | null;

/** IPF GL points (classic, raw by default). Check value: 90 kg bodyweight, 700 kg total, male -> 93.06. */
export type IpfGl = (input: { totalKg: number; bodyweightKg: number; sex: Sex; equipped?: boolean }) => number | null;

/** Allometric relative strength: lift / bodyweight^0.67. */
export type Allometric = (input: { liftKg: number; bodyweightKg: number }) => number;

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

/** Only barbell squat/bench/deadlift (and the standard lifts with norms). null for machines, unknown sex, PREFER_NOT_TO_SAY. */
export type StrengthPercentileFn = (input: {
  standardLift: StandardLift;
  e1rmKg: number;
  bodyweightKg: number;
  sex: Sex;
  ageYears: number | null;
}) => StrengthPercentile | null;

/** Run all ten rules (each may emit 0..n cards). Deterministic: same input -> same cards in the same order. */
export type RunInsightRules = (input: AnalyticsInput) => InsightCard[];

/** One rule: a pure function from the shared input to cards. Rules are exported individually for unit tests. */
export type InsightRule = (input: AnalyticsInput) => InsightCard[];

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
```

<!-- sig: src/contracts/insights.ts#BuildWeeklyFacts -->
```ts
// from src/contracts/insights.ts
/** Signature of the pure facts builder (src/lib/analytics/facts.ts, stream D). */
export type BuildWeeklyFacts = (input: AnalyticsInput, opts: { weekStart: string }) => InsightFacts;
```

## Deliverables

- **Volume** (`volume.ts`): `isHardSet` (completed, not WARMUP, RIR <= 4 or unrecorded; DROP counts) and `weeklyMuscleVolume` (primary muscle 1.0, secondary 0.5 per hard set; machine sets count fully; only sets whose `localDate` is in the ISO week; default band 10-20 fractional sets for hypertrophy goals, goal-adjusted otherwise, all bands as cited constants; result independent of set order).
- **Series + forecast** (`series.ts`, `forecast.ts`): `sessionBestE1rm` (best e1RM per session from non-warm-up, non-drop sets of <= 10 reps; one series at a time; never merges `seriesKey`s). `forecastE1rm`: Bayesian linear regression on `ln(t + t0)` in closed form; prior from population curves by sex/lift/training age (Steele 2022, Latella 2020/2023, Swinton 2021 in `docs/research.md`), `t0` from experience or the first workout date, noise sigma ~ 5% of e1RM, exclude deload sessions and outliers > 3 MAD from the median, require >= 6 sessions over >= 3 weeks (else `status: "insufficient"` with the reason), horizon <= 12 weeks with 50% and 80% bands, reset the fit after a layoff of >= 4 weeks. Forecast in percent (no sex-specific curve shapes).
- **Stall + progression** (`progression.ts`): `detectStall` (change under ~5% is noise, deload sessions ignored) and `suggestProgression` (double progression with the 2-for-2 rule; increments 2-10%; when `incrementKg / currentLoadKg > 0.10` on machines add reps first).
- **Scores** (`scores.ts`): `dots`, `ipfGl` (classic raw default; check value 90 kg bodyweight / 700 kg total male = 93.06; bench-only and Wilks2 coefficients stay OFF, marked `[Verify]`), `allometric` (lift / BW^0.67), `ffmi` (+ normalized + range at BF +-4 points), `navyBodyFat` (cm, log10), `resolveBodyFat` (DEXA > BIA/CALIPERS > NAVY_TAPE computed from tape > SCALE; the BMI/Deurenberg estimate is never used), `bodyweightTrend` (time-decayed moving average). DOTS/IPF only for barbell squat/bench/deadlift totals. PREFER_NOT_TO_SAY -> averaged coefficients and no percentiles.
- **Percentiles** (`standards.ts`): `strengthPercentile` returns `{percentile, population, source}` and always names the comparison population. Machines, unknown sex and PREFER_NOT_TO_SAY return `null`. If you cannot source strength-standard data you can cite (StrengthLevel skews high, OpenPowerlifting is competitors only, ExRx/Kilgore is expert-derived, Symmetric Strength is formula-based), implement the lookup with the data you can cite, return `null` elsewhere, and say so in your report: do not invent norms.
- **Rules** (`insights/rules.ts`): all ten rules, each a pure `InsightRule` in `INSIGHT_RULES` + `runInsightRules` (deterministic order): volume-band, stalled-lift (deload / change variation / change rep range), double-progression (2-for-2; machine stack jumps -> reps first), effort-check (typical RIR >= 4), frequency-session-cap (per-session cap ~11 fractional sets is a **preprint**: label it so, `[Contested]`), rep-range-goal, relative-strength-percentile (names the population), on-track-vs-population (only when the 80% bands separate), ffmi-context, cut-strength-drop (slow the cut; 1.6 g/kg protein). Each card has `id`, `ruleId`, `severity`, `title`, `body`, `evidence[]`, `citations[]`. **No medical advice; neutral body-composition language; hyperplasia is education only (there is no hyperplasia mode).** Machine series are separate: never compare or convert machine loads to barbell numbers.
- **Facts** (`facts.ts`): `buildWeeklyFacts(input, {weekStart})` returns an object that passes `insightFactsSchema`, with the fact id scheme in CONTRACTS.md section 7, calling the rules for `insights`. Numbers rounded sensibly (kg to 0.1, % to 0.1) so the narrative's numeric-grounding check works.
- **Citations**: fill `CITATIONS` in `constants.ts` from `docs/research.md` (keys like `schoenfeld2017`, `grgic2020`; label + URL). Rule cards may only cite keys that exist (test it).
- **Fixtures** (`src/lib/fixtures/**`, pure, seeded PRNG, no `Date.now()`): `generateLifterHistory(options)` -> `AnalyticsInput` for a 16-week intermediate lifter with a deload week, a **planted bench-press stall**, a **steadily progressing squat**, **leg press at two gyms** (two machine profiles -> two separate series), a **pin-labelled leg curl** (selectorized, `labelUnit`/`pinStepKg`), **weighted pull-ups** (BODYWEIGHT_PLUS), and a **weight cut with tape measurements**; plus edge-case users (brand new, one session, layoff, kg/lb mixed entry, no bodyweight, PREFER_NOT_TO_SAY). Export the planted-signal expectations so tests assert them.
- **Demo-user seed** `prisma/seed/fixtures.ts`: `seedDemoUser(prisma)` creates `demo@overload.test` (password is a documented test-only constant in the file) through Better Auth's server API (`auth.api.signUpEmail`) so login works, a complete `Profile`, and the generated history as real rows (exercises from the catalog by `catalogExerciseId`, a `MachineProfile` per machine, workouts/exercises/sets with derived columns computed via `effectiveLoadKg`/`estimate1RM`, sync metadata via `bumpSyncVersion` + `syncMixin`, PRs left for stream E1's rebuild). Idempotent. Expose it as `pnpm exec tsx prisma/seed/fixtures.ts` (a tiny `main()` guarded by `import.meta.url`); `prisma/seed/index.ts` is frozen, so stream F/W3 call it directly.
- Tests: unit tests per function with the check values from `docs/research.md`; **fast-check properties** (e1RM rises with load and with reps; weekly volume does not depend on set order; forecast bands are ordered `low80 <= low50 <= p50 <= high50 <= high80`; DOTS increases with total); **planted signals detected**: bench stall yes, squat no, the two leg-press series stay separate, deload excluded from the forecast.

**Notes.** Pure functions never read the clock: `today` comes from the input. Prefer small modules and exhaustive tests; Wave 2 streams F and G build on your exact signatures. Wilks2 / IPF GL bench-only coefficients must remain disabled until verified.

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass; `pnpm ownership:check --stream=D` passes.
2. `pnpm test:analytics-coverage` passes (>= 95%).
3. `signatures.test.ts` still passes untouched (every export keeps its contract type).
4. The planted-signal tests pass on the generated fixtures.
5. On your Neon branch: `pnpm exec tsx prisma/seed/fixtures.ts` twice (idempotent) and `pnpm test:integration` (add one integration test that loads `loadAnalyticsInput` for the demo user and runs `runInsightRules` + `buildWeeklyFacts` and validates with `insightFactsSchema`).

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `src/lib/fixtures/**` must not import anything under `src/server` (pure); the seed in `prisma/seed/fixtures.ts` may.
- `src/server/queries/facts.ts` is frozen: if the facts feed lacks something analytics needs, file a change request.

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/D-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=D` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).
