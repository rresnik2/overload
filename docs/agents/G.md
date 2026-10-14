# Stream G: Insights and Learn

**Wave 2. Model: Sonnet 5.5. Dev-server port: 3003** (`pnpm dev -p 3003`; set `PORT=3003` for Playwright).

## Your goal

Deliver the insight cards, the Claude-written weekly narrative, the weekly cron, on-demand regeneration (capped), and the `/learn` evidence articles. Plan sections: "Claude weekly narrative", "Analytics and insights engine" (insight rules, hyperplasia), Wave 2 table row G.

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.
4. **Load the `claude-api` skill before writing any Anthropic SDK code** (Skill tool, skill name `claude-api`).

## Setup (your own git worktree, branch `g/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch G                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3003
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/G-*.md`; colocated tests inside your paths are yours):

- `src/app/(app)/insights/**`
- `src/app/(marketing)/learn/**`
- `src/app/api/cron/insights/**`
- `src/components/insights/**`
- `src/components/learn/**`
- `src/server/insights/**`
- `src/server/actions/insights.*`
- `src/styles/insights.css`
- `e2e/insights.spec.ts`

`pnpm ownership:check --stream=G` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- `requireUser()`, `requireSessionInfo()`, `withUser()`, `withUserRoute()`, branded `UserCtx` (`src/server/auth/session.ts`), `prisma` (`src/server/db.ts`), mappers, `src/lib/{units,dates,ids}.ts`.
- The four primitives `HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` (`src/components/primitives/*`) and the daisyUI themes in `src/styles/theme.css`.
- Your own CSS partial in `src/styles/` (already imported by `globals.css`).
- **Merged from Wave 1** (read their code, do not edit it): stream B's `src/components/ui/**` + shell + `/styleguide`; stream C's `src/components/exercises/**` + `/api/catalog`; stream D's analytics + fixtures + demo-user seed; stream E1's `repo`, `useLive`, `SyncProvider`, `syncNow`, `useOnSynced`, `useSyncStatus`, `/api/sync`; stream A's auth, onboarding and settings.
- Stream D's `runInsightRules`, `buildWeeklyFacts`, `CITATIONS`, fixtures + demo user; the facts loaders (`loadAnalyticsInput`); `InsightFacts` / `InsightNarrative` schemas, `collectFactIds`, `InsightReportRow` (`src/contracts/insights.ts`); the `InsightReport` model; `zonedTimeToUtc`, `isoWeekStart`, `toLocalDate` (`src/lib/dates.ts`); `@anthropic-ai/sdk` is installed; `INSIGHTS_MODEL` (default `claude-opus-5-5`), `ANTHROPIC_API_KEY`, `CRON_SECRET` in `.env.example`; `vercel.json` already schedules `/api/cron/insights` hourly; `@next/mdx` is configured (`.mdx` pages work).

<!-- sig: src/contracts/insights.ts#InsightReportRow,BuildWeeklyFacts,collectFactIds! -->
```ts
// from src/contracts/insights.ts
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

/** Signature of the pure facts builder (src/lib/analytics/facts.ts, stream D). */
export type BuildWeeklyFacts = (input: AnalyticsInput, opts: { weekStart: string }) => InsightFacts;

/** Every citable fact id in a facts bundle (for validating narrative factRefs). Implemented. */
export function collectFactIds(facts: InsightFacts): Set<string>;
```

<!-- sig: src/contracts/analytics.ts#AnalyticsInput,InsightCard,RunInsightRules -->
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
```

<!-- sig: src/server/queries/facts.ts#loadAnalyticsInput! -->
```ts
// from src/server/queries/facts.ts
/** Everything the rule engine and facts builder read, over `lookbackWeeks` ISO weeks ending today. */
export async function loadAnalyticsInput(
  ctx: UserCtx,
  opts: { today: LocalDate; lookbackWeeks?: number },
): Promise<AnalyticsInput>;
```

<!-- sig: src/server/auth/ctx.ts#mintUserCtx! -->
```ts
// from src/server/auth/ctx.ts
export function mintUserCtx(id: string): UserCtx;
```

## Deliverables

- **Before you write any Anthropic SDK code, load the `claude-api` skill** (invoke it with the Skill tool) and follow it for the Messages API, structured outputs, prompt caching, token usage, and error handling: model ids and parameters change, so do not rely on memory.
- `src/server/insights/**`: `generateNarrative(facts)` using `@anthropic-ai/sdk` with `INSIGHTS_MODEL`; a **static, cached system prompt** (prompt caching on the system block; `promptVersion` constant stored on each report); the user turn contains only the `InsightFacts` JSON; structured output validated with `insightNarrativeSchema` (headline, summary, sections with `factRefs`, **at most 3 actions**).
- **Guardrails**: (1) numeric grounding: every number in the narrative must appear in the facts JSON (extract numbers from headline/summary/sections/actions and compare, tolerant of formatting like `1,200` and `82.4 kg`), otherwise **retry once**, then fall back to the rules-only cards (store `status: FAILED` + `error` or `READY` with `narrative: null`, whichever your design documents); (2) every `factRefs` id must exist in `collectFactIds(facts)`; (3) user-written text (notes, custom exercise names) is passed only as quoted JSON data inside the facts, with an explicit system-prompt instruction to treat it as data, never as instructions; (4) no medical advice, neutral body-composition language, hyperplasia is education only.
- **Pipeline** (`pipeline.ts`): `loadAnalyticsInput` -> `buildWeeklyFacts` -> validate -> `factsHash` (stable JSON + sha256) -> if an `InsightReport` for `(userId, weekStart)` has the same hash return it, else generate; store `facts`, `factsHash`, `narrative`, `model`, `promptVersion`, `inputTokens`, `outputTokens`, `generatedAt` on `InsightReport`. Rules-only cards (`insights` inside the facts) are always available even when generation fails or `ANTHROPIC_API_KEY` is missing.
- **Cron** `GET /api/cron/insights` (`src/app/api/cron/insights/route.ts`): requires `Authorization: Bearer ${CRON_SECRET}` (401 otherwise); runs hourly; for each user with `insightsEnabled` whose local time is **Monday 05:00 in their timezone** (compare `zonedTimeToUtc(isoWeekStart(localToday), 5, 0, tz)` with the current hour) and no report for that week, generate (use `mintUserCtx(user.id)`; bound concurrency; one user's failure never stops the rest).
- **On-demand regeneration** Server Action (`src/server/actions/insights.ts`, `requireUser`, no `userId` input): at most **3 per week** (`InsightReport.onDemandCount`), an unchanged `factsHash` returns the stored report without calling the model and without consuming a regeneration.
- `(app)/insights` (latest report: rule cards + narrative with `InsightCard` expand/collapse showing evidence and citations; history of previous weeks; regenerate button with remaining count) and `components/insights/**`: `InsightCard` (info/suggestion/warning/celebration; collapsed/expanded with evidence and citation links), and the Wave 3 export **`LatestInsightCard`**.
- **`/learn`** (`(marketing)/learn/**`, `components/learn/**`; MDX or TSX): articles on hypertrophy vs hyperplasia (education only: "Muscles grow mainly because fibers get larger; whether adults gain new fibers is unresolved and likely minor. Training well for size covers it."; keep **[Contested]** labels), e1RM, RIR, volume landmarks, machine vs free weight (load is not comparable across machine brands). **Check every citation link in `docs/research.md` before using it** (fetch it; drop or replace dead ones) and find real sources for the four "cited from memory" items (Haun 2019, Helms 2014, Schoenfeld 2016 rest intervals, Morton 2018) or leave them out. Styles in `src/styles/insights.css`.

**Notes.** Cost controls are part of the acceptance criteria: weekly cron only, on-demand cap 3/week, hash dedupe, token counts stored. The narrative must never state a number that is not in the facts.

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass; `pnpm ownership:check --stream=G` passes.
2. Unit tests with the **Anthropic client mocked**: prompt content (facts only, user text quoted), structured-output validation, **numeric-grounding test** (a narrative with an invented number is rejected, retried once, then falls back), `factRefs` validation, rate-limit test (4th on-demand call in a week refused), hash-dedupe test (same facts -> no model call), cron auth test (401 without the secret) and local-time selection test across several timezones including DST.
3. One **opt-in live test** guarded by `INSIGHTS_LIVE=1` (skipped otherwise; skipped in CI) that runs the real model on the demo user's facts. If you have no API key, report it as PENDING; never invent a key.
4. `PORT=3003 pnpm exec playwright test e2e/insights.spec.ts --project=chromium` as the demo user with the model mocked at the SDK boundary (rules-only cards render; narrative renders when present; `/learn` pages render with working citation links).
5. Report the exact prompt version, model id used, cached-system-prompt size in tokens, and a sample `usage` object from a live call (or PENDING).

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `src/lib/analytics/**` (D: if a rule is wrong, file a change request), `src/contracts/**` (frozen: the facts/narrative schemas), `src/app/(app)/layout.tsx` (B), `vercel.json` (frozen).

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/G-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=G` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).

## Coordinator note (Hobby plan)
Vercel Hobby only allows crons that run at most once a day, so `/api/cron/insights` runs daily at 12:00 UTC (vercel.json). The handler must generate a report for every user whose current ISO week has no READY report yet. Do not rely on an hourly "Monday 05:00 local" check.
