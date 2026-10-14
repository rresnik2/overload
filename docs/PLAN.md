# Overload: multi-agent build plan

_"Overload" is a working name (from progressive overload); rename it freely._

## Context

This is a greenfield build: the workspace is empty, so there's no existing code to reuse. Reece wants a multi-user fitness web app with these requirements:

- Log lifts and see weight × rep progression over time.
- A large exercise catalog, with **machine** and **free-weight** exercises kept clearly separate.
- Charts of progression, plus forecasts.
- Works well on desktop and mobile, and installs to the iPhone home screen.
- A backend that stores the data, with auth so each user sees only their own data.
- Insights grounded in research (hypertrophy vs. hyperplasia, how lifters progress), personalized by weight, height, sex and body composition.
- The look of reece-resnik.vercel.app.
- Next.js, daisyUI and Prisma.

The work is split so that several Claude Code sessions can build it **in parallel in separate git worktrees** without editing the same files.

### Decisions
| Topic | Decision |
|---|---|
| Insights | Deterministic rules and stats engine, **plus** a weekly narrative written by Claude in v1 |
| Auth | Better Auth: email + password (verification and reset through Resend), Google OAuth, passkeys |
| Offline | Offline-first logging: IndexedDB (Dexie) outbox and a batch `/api/sync` route; merge is last-write-wins per field, ordered by a hybrid logical clock (HLC) |
| Execution | Phase 0 foundation, then Wave 1 (5 parallel sessions), Wave 2 (3), Wave 3 integration. **Every build agent runs on Sonnet 5.5.** This session only coordinates, reviews and merges |
| Hosting | Vercel + Neon Postgres (pooled URL at runtime, direct URL for migrations, one Neon branch per worktree) |

### Stack (pinned versions, verified 2026-10-14)
- **Framework:** Next **16.4.1** (Turbopack, `proxy.ts`, `cacheComponents` **off** for v1) · React **19.3.1** · TypeScript **6.0.3** (not 7: typescript-eslint doesn't support it yet) · Node **24 LTS**
- **Styling and validation:** Tailwind **4.3** + daisyUI **5.7** (CSS-first config, `@plugin "daisyui" { themes: false }`) · Zod **4.6**
- **Database:** **Prisma 7.10, pinned to `^7`.** `prisma@latest` is now an **8.0 RC** that rewrites the query API, so **never run `npx prisma@latest`**. Uses the `prisma-client` generator, `prisma.config.ts`, and `@prisma/adapter-pg` with Vercel `attachDatabasePool`.
- **Auth:** Better Auth **1.7.8** + `@better-auth/passkey`. Auth.js is now maintained by the Better Auth team, and NextAuth v5 never left beta.
- **App libraries:** Recharts **3.10** (an `<Area>` with a `[low, high]` dataKey draws the forecast band) · Serwist **9.5** + `@serwist/turbopack` · Dexie **4.4** · `@anthropic-ai/sdk` · Resend
- **Testing and linting:** Vitest **5** · Playwright **1.64** (Chromium and WebKit iPhone) · ESLint 10 flat config + `eslint-config-next`

---

## Design system: taken from reece-resnik.vercel.app

I extracted these from the live site's computed styles. The portfolio already runs Tailwind 4 and daisyUI 5, so its tokens carry over as-is.

### Tokens
| Token | Light theme: `overload-paper` | Dark theme: `overload-ink` | Source / note |
|---|---|---|---|
| `base-100` | `#F4F2ED` paper | `#1C1B19` | Portfolio `--color-paper`. The site's dark backdrop is about `#1F1F1F` |
| `base-200` / `base-300` | `#EAE7DF` / `#DCD8CE` | `#232220` / `#2E2C29` | Derived |
| `base-content` | `#141414` ink | `#EDEAE3` | Portfolio `--color-ink` |
| `--color-vermilion` (brand) | `#E4402B` | `#F26A55` | Used for borders, hard shadows, display type and icons. **3.7:1 on paper: never use for small body text** |
| `primary` (filled buttons) | `#C8321F` (vermilion-deep) | `#F26A55` | Paper text on `#C8321F` is 4.8:1 and passes AA. On dark, ink text on `#F26A55` |
| `neutral` | `#141414` | `#EDEAE3` | Ink buttons and tooltips |
| Radius (`--radius-box/field/selector`) | `0` | `0` | The site uses square corners everywhere |
| `--border` / `--depth` / `--noise` | `1px` / `0` / `0` | same | Flat surfaces |
| `--shadow-hard` | `6px 6px 0 var(--color-vermilion)` | same | Portfolio hero card |
| Display font | **Instrument Serif** 400, italic for headings | same | Regular and italic only, so never set it bold |
| Body / UI font | **Newsreader** variable, weights 200–800 | same | Use `tabular-nums lining-nums` for every number. Phase 0 confirms the font has a `tnum` feature, with a mono fallback for set inputs |
| Motion | `--page-out: .18s`, `--page-in: .36s`, ease-out `cubic-bezier(.22,1,.36,1)` | same | The portfolio's view-transition page slides. Disabled when the user prefers reduced motion |

The active theme is stored in `localStorage` and set by an inline `<head>` script (with `suppressHydrationWarning`). The app follows `prefers-color-scheme` by default. Dark mode is the gym default once the app is installed.

### Signature motifs, reused from the site
- **Frame navbar.** Asymmetric vermilion border (`border-t border-r-4 border-b-8 border-l-2`) on paper. On desktop it's the top navbar. On mobile it becomes a daisyUI **`dock`** with the same frame, sitting above `env(safe-area-inset-bottom)`.
- **Hard-shadow card.** `HardCard`: paper, square, `--shadow-hard`. On press it moves `translate(2px,2px)` and the shadow shrinks to 4px.
- **Numbered section headers.** `01/Progress` in Instrument Serif with a 2px vermilion underline rule.
- **Meta lines.** `Free weight / Barbell` with a vermilion slash, the same as the site's `Web app / Live`.
- **Big stat numerals.** Instrument Serif number plus a small Newsreader label, like the site's `91 Lighthouse`. Used for e1RM, PRs and weekly sets.
- **Link underline.** A vermilion `::after` that animates `scaleX` on hover, stays on for `aria-current`, plus the `tap-target` 44px `::before` hit area.
- **Ring-offset avatar.** `ring-2 ring-vermilion ring-offset-6`.
- **Grayscale photo backdrop.** Fixed-position background on the marketing, auth and onboarding pages only, never on the logging screens.

### Components (owner in brackets)
| Component | Variants | States | Notes |
|---|---|---|---|
| Button [B] | primary (vermilion-deep), ink, ghost (underline), danger | default, hover, active (press offset), disabled, loading | 44px minimum height |
| Field / NumberStepper [B] | text, number, weight (unit suffix), reps, RIR | default, focus (vermilion ring), error, disabled | **Text at least 16px** so iOS doesn't zoom in. Steppers step by the exercise's increment |
| HardCard / SectionHeader / PageHeader / EmptyState [P0] | — | — | Props frozen in Phase 0 |
| Stat [B] | sm, md, lg | default, PR (vermilion star), loading skeleton | |
| Tabs / ModalityTabs [B] | Free weight · Machine · Cable · Bodyweight | selected, focus | Vermilion bar under the selected tab |
| Sheet / Modal / Toast [B] | bottom sheet on mobile, dialog on desktop | open, closing | Toast for PRs, sync results and errors |
| SyncPip [B] | idle · syncing · offline · error · signed-out | — | Lives in the shell. Uses `useSyncStatus()` |
| SetRow [E2] | one per TrackingType × LoadType label (per hand, per side, stack, +BW) | planned, active, completed, PR, warm-up (muted) | Shows "last time" values as ghost text |
| RestTimer [E2] | inline, sheet | running, done, paused | Counts down to an absolute `restEndsAt` |
| ChartFrame and charts [F] | e1RM + forecast band, top set, volume, weekly sets vs. landmarks, body trend, calendar heatmap | loading, empty, low-data ("needs 6 sessions") | Every chart has an accessible table fallback |
| InsightCard [G] | info, suggestion, warning, celebration | collapsed, expanded (shows evidence and citation) | |

**Data-viz palette (B validates with the `dataviz` skill in both themes):**
- Modalities: free weight = vermilion, machine = ink/graphite, cable = slate blue, bodyweight = ochre.
- Forecast: dashed line, with the 80% band at 12% opacity and the 50% band at 22%.
- PR markers: filled vermilion stars.

**Accessibility (enforced in Wave 3):**
- WCAG AA contrast.
- Every interactive element is reachable by keyboard and has a visible focus ring.
- The app shell has landmarks.
- Charts expose `aria-describedby` summaries.
- Run `design:accessibility-review` on key screens.

---

## Architecture

### Routes (`src/app`)
| Group | Path | Notes |
|---|---|---|
| `(marketing)` | `/`, `/learn/**` | Landing page. Evidence articles: hypertrophy vs. hyperplasia, e1RM, RIR, volume landmarks, machine vs. free weight |
| `(auth)` | sign-in, sign-up, verify-email, forgot-password, reset-password | |
| `(onboarding)` | `/onboarding` | Collects sex (used for formulas, with prefer-not-to-say), birth date, height, units, experience, goal, timezone, first bodyweight and body fat |
| `(workout)` | `/workout` | Active session. **Dexie-only client page**, precached so it works offline |
| `(app)` | `/today`, `/exercises/**`, `/history/**`, `/templates/**`, `/progress/**` (per exercise, `/body`, `/prs`), `/insights/**`, `/settings/**` (profile, security/passkeys, machines, account export/delete) | |
| `api` | `auth/[...all]`, `sync`, `catalog` (ETag), `cron/insights`, `health` | Route handlers |

- **Security boundary.**
  - `src/server/auth/session.ts` exports `requireUser()` and `withUser()`. Both return a branded `UserCtx`.
  - Every query, Server Action and sync function takes `ctx` and filters with `where: { userId: ctx.id }`.
  - No Zod input schema accepts a `userId` field.
  - `proxy.ts` only redirects early based on whether a cookie exists. It is not the security check.
- **Import rules (ESLint).**
  - `src/lib/**` stays pure (no react, next, server code or Prisma).
  - The Prisma client is imported only under `src/server/**` and `prisma/**`.
  - Decimal values never leave `src/server` (mappers convert them to numbers).
- **Server Actions** are used only for online forms (profile, settings, body metrics, regenerating an insight). **Sync and the exercise catalog are route handlers**, because Server Action IDs change on every deploy and an offline client on an older bundle would break.

### Data model
The full schema is in **Appendix A**. The key rules:

- **IDs.** Every row the client can write uses a client-generated **UUIDv7**. Catalog exercises use a UUIDv5 derived from their free-exercise-db ID, so reseeding keeps IDs stable.
- **Modality.** `Exercise.modality` is FREE_WEIGHT, MACHINE, CABLE, BODYWEIGHT, BAND or OTHER. `equipment` is finer-grained (barbell, dumbbell, kettlebell, EZ bar, trap bar, Smith machine, selectorized machine, plate-loaded machine, cable, and so on).
- **What a logged weight means** (`LoadType`):

  | LoadType | Effective load |
  |---|---|
  | TOTAL | The number entered |
  | PER_IMPLEMENT | × 2 unless the exercise is unilateral |
  | PLATES_PER_SIDE | 2 × entry + the machine's base load |
  | STACK | The stack number entered |
  | BODYWEIGHT_PLUS | Bodyweight × factor + added load |
  | NONE | No load |

- **Machine progression stays separate.** `MachineProfile` records gym, brand, pin step, base load and label unit. Each progression series is keyed `seriesKey = exerciseId:machineProfileId`. Machine lifts never get DOTS scores or percentiles, and are never converted to barbell equivalents.
- **Units.** Weights are stored in kg as `Decimal(7,3)`. The unit the user typed (`inputUnit`) is kept so pound entries display exactly as entered.
- **Sets.** The set table is named `WorkoutSet` so it doesn't shadow the JavaScript `Set`. It stores `effectiveLoadKg` and `e1rmKg`, both computed on the server.
- **Dates.** `Workout.localDate` (the device's local date when the workout starts) is the only field used to group by day or week. Weeks run Monday to Sunday (ISO).

### Offline sync
- **Client writes.** A write goes to the Dexie row, its per-field HLC and the outbox in one transaction. Sync runs on app start, `online`, `visibilitychange`, 1.5 s after a write, every 30 s while there are pending changes, and from a manual "Sync now". iOS has no Background Sync, so these triggers replace it. `navigator.locks` keeps it to one sync at a time.
- **`POST /api/sync`.** The client sends up to 200 mutations and a cursor.
  - The server checks each mutation's owner and references first; a bad one gets a per-mutation `rejected` and goes to a dead-letter queue, so it never blocks the rest.
  - The server holds a lock on the user's `SyncState` row, merges each field by HLC, gives each changed row the next version number, and rebuilds PRs for the affected series.
  - The response returns rows with `version > cursor`, at most 1000 per page.
- **The merge function** (`src/lib/sync/merge.ts`) is shared by client and server. Merging is commutative and idempotent, and a property test checks that two devices converge.
- **Edge cases.**
  - A client clock running fast has its HLC clamped to server time + 5 minutes.
  - Deleted rows are tombstoned for 90 days; after cleanup, a client whose cursor is too old does a full reset.
  - Each user gets their own Dexie database.
  - If the session expires while offline, pending changes are kept and the user sees "Sign in to sync N changes".
  - A service-worker update never activates in the middle of a workout.

### Analytics and insights engine (`src/lib/analytics`, pure TS)
The evidence is in **Appendix B**.

- **e1RM.** Epley with RIR folded in: `w·(1 + (reps + RIR)/30)`. A single rep with no RIR returns the weight itself. No estimate when reps + RIR > 12, and estimates above 10 are flagged low-confidence. Brzycki is offered as a user setting.
- **Noise.** A change smaller than about 5% is treated as noise (1RM test-retest coefficient of variation is about 4%).
- **Weekly volume.** Count fractional hard sets per muscle: primary muscle 1.0, secondary 0.5. A hard set is a completed set that isn't a warm-up, with RIR ≤ 4 or not recorded. Compare against default bands of 10–20 sets per week for hypertrophy.
- **Forecast.** A Bayesian linear regression on `ln(t + t₀)`, which has a closed-form solution.
  - The prior comes from population curves by sex, lift and training age; `t₀` comes from experience level or the date of the first logged workout.
  - Noise σ is about 5% of e1RM.
  - Data: each session's best e1RM from sets of 10 reps or fewer, excluding deload weeks and outliers more than 3 MAD from the median.
  - It needs **at least 6 sessions over at least 3 weeks**. The horizon is at most 12 weeks, shown with 50% and 80% bands.
  - The fit resets after a layoff of 4 or more weeks.
- **Body metrics.**
  - DOTS and IPF GL scores: barbell squat, bench and deadlift only.
  - Allometric relative strength: lift ÷ BW^0.67.
  - FFMI and normalized FFMI, shown as a range because body-fat error carries through.
  - US Navy tape body-fat estimate, using the cm formulas.
  - Body-fat source priority: DEXA > BIA/calipers > tape > BMI. The BMI estimate is never used for FFMI.
  - Bodyweight trend: a time-decayed moving average.
- **Insight rules.** These ten rules from Appendix B each produce `{severity, title, body, evidence, citations}`:
  1. Volume below the floor or above the ceiling
  2. Stalled lift (deload, change variation or rep range)
  3. Double-progression nudge (the 2-for-2 rule: add load; on machines with large stack jumps, add reps first)
  4. Effort check (typical RIR of 4 or more)
  5. Frequency and per-session cap (the cap is based on a preprint and labelled as such)
  6. Rep range doesn't match the goal
  7. Relative-strength percentile, naming the comparison population
  8. On track vs. population curve (only when the 80% bands separate)
  9. FFMI context
  10. Losing weight while strength drops (slow the cut; 1.6 g/kg protein)
- **Hyperplasia.** Covered as education only on `/learn`: muscle grows mainly through fiber hypertrophy, and hyperplasia in humans is unproven and probably minor. There is **no** "hyperplasia mode" and no sarcoplasmic vs. myofibrillar program mode.

### Claude weekly narrative (`src/server/insights`)
- **Pipeline.**
  - `loadSetFacts` → `buildWeeklyFacts` → Zod-validated `InsightFacts` JSON → `factsHash`.
  - The Anthropic SDK returns a structured `InsightNarrative`: a headline, a summary, sections with `factRefs`, and at most 3 actions for next week.
  - The model is set by the `INSIGHTS_MODEL` environment variable (default `claude-opus-5-5`). The system prompt is static and cached. **The G agent must load the `claude-api` skill before writing this code.**
- **Guardrails.**
  - Every number in the narrative must appear in the facts; otherwise retry once, then fall back to the rules-only cards.
  - User-written text (notes, custom exercise names) is passed in only as quoted data.
  - No medical advice. Body-composition language stays neutral.
- **Cost controls.**
  - A cron job runs weekly, at Monday 05:00 in each user's timezone.
  - Users can regenerate on demand up to 3 times a week. An unchanged `factsHash` returns the stored report.
  - Token counts are stored on each `InsightReport`.

---

## Multi-agent execution

### How the sessions are coordinated
- **Every build agent runs on Sonnet 5.5** (`claude-sonnet-5-5`). That covers Phase 0, all Wave 1 and Wave 2 streams, Wave 3, and any short-lived agent that applies change requests. Each one is started as its own session with `model: "claude-sonnet-5-5"`.
- **The coordinator** is this session, on `main`. It writes no feature code. Its jobs:
  - Start the Phase 0 session (on `main`), and then each wave's sessions in **their own worktrees**, one branch per stream.
  - Review every branch's diff against its brief and acceptance checks.
  - Merge into `main` in dependency order, running `pnpm check && pnpm build` after each merge.
  - Apply any queued change requests, through a short Sonnet session.
  - Start the next wave from that commit.
- **Briefs are written for Sonnet.** Each `docs/agents/<stream>.md` spells out:
  - exact file paths
  - the function signatures, copied from `CONTRACTS.md`
  - acceptance commands to run before reporting done
  - a "do not touch" list

  If a stream fails review, the coordinator sends follow-up instructions to that same session rather than starting a new one.
- **The in-app narrative model is a separate setting.** The `INSIGHTS_MODEL` environment variable picks the model that writes the weekly insights inside the app, and it doesn't change which model builds the app.
- **Each session's brief** is a file the agent reads at start: `docs/agents/<stream>.md`, written in Phase 0 from this plan. It lists the goal, the paths the stream owns, the contracts it can rely on, what it must deliver, how it's accepted, and what it must not touch. Every session also reads `CLAUDE.md` and `CONTRACTS.md`.
- **Ownership is enforced.** `ownership.json` maps path globs to streams. `pnpm ownership:check --stream=X` fails if a branch changes anything outside its globs. There are no `index.ts` barrels that re-export another stream's files, and each stream has its own CSS partial.
- **Frozen files.** After Phase 0, these are frozen: `package.json`, the lockfile, `prisma/schema.prisma`, `src/contracts/**`, `session.ts` and the root layout.
  - A session that needs one changed writes `change-requests/<stream>-<n>.md` (the diff, the reason, a workaround) and keeps working.
  - The coordinator applies change requests at wave boundaries, or mid-wave if one is blocking; sessions then `git rebase main`.
  - After Wave 1, schema changes must be additive.
- **Isolation per worktree.** Each worktree gets its own Neon branch (`pnpm db:branch <stream>`, via neonctl, which writes `.env.local`) and its own dev-server port (3001–3005). Worktrees never run `prisma migrate dev`.

```
Phase 0 ──► Wave 1: A Auth · B Shell/PWA · C Catalog · D Analytics · E1 Sync engine
                 └──► Wave 2: E2 Logging UI (needs B,C,E1) · F Progress (needs B,D) · G Insights (needs D)
                          └──► Wave 3: Integration + QA
Merge order W1: D → E1 → C → A → B        W2: E2 → F → G
```

### Phase 0: Foundation (one Sonnet 5.5 session, on `main`)
- **Scaffold.** `git init`, Next 16.4 scaffold, **every dependency installed up front** (so later waves never touch `package.json`), and all config files. `browserslist: "> 1%"` for daisyUI with Lightning CSS. Serwist through `@serwist/turbopack`; fall back to `next build --webpack` only if that fails.
- **Database.** Prisma schema from Appendix A, the first migration, and the Better Auth tables generated with every plugin enabled. `src/server/db.ts` uses `adapter-pg` with `attachDatabasePool`.
- **Shared libraries.** The DAL (`requireUser`/`withUser`), the mappers, and `src/lib/{units,dates,ids}.ts`, all implemented and tested. `src/server/queries/facts.ts` is implemented and frozen.
- **Theme and layout.** `src/styles/theme.css` with both daisyUI themes, the fonts through `next/font`, the root layout (`viewportFit: "cover"`, `appleWebApp` with `black-translucent`, `themeColor`), and four primitives with frozen props.
- **Contracts.** Everything under `src/contracts/`: enum mirrors with a check that they match Prisma, entity Row/Create/Patch types, sync payloads, catalog, analytics types, `InsightFacts`/`InsightNarrative`, and fixtures.
- **Stubs.** Analytics signatures as stubs, except `estimate1RM` and `effectiveLoadKg`, which are fully implemented. Sync signatures (`repo`, `SyncProvider`, `useSyncStatus`, `applyServerMutations`) as stubs.
- **Seed and auth.** A 30-exercise seed. Minimal email and password auth.
- **Repo docs and CI.** `ownership.json` with its check, `CLAUDE.md`, `CONTRACTS.md`, the `docs/agents/*.md` briefs, `docs/research.md` (copied from Appendix B), and CI (typecheck, lint, vitest, ownership, `prisma migrate diff --exit-code`).
- **Accepted when:** `pnpm check` and `pnpm build` pass; migrate and seed succeed on a fresh Neon branch; Playwright can sign up, sign in and reach the stub app page; a Vercel preview deploys.

### Wave 1: five Sonnet 5.5 sessions in parallel
| Stream | Owns | Delivers | Accepted when |
|---|---|---|---|
| **A: Auth, Profile, Onboarding** | `(auth)`, `(onboarding)`, `settings/{profile,security,account}`, `server/auth/auth.ts`, `server/{email,profile}`, `components/{auth,profile}` | Better Auth with Resend email verification and password reset, Google, passkeys (registered in settings, sign-in through autofill), rate limits, 30-day sessions; onboarding wizard; JSON export and account deletion | `e2e/auth.spec.ts` (sign up → verify via a mocked inbox → onboarding → `/today`; password reset). Profile actions ignore any `userId` the client injects |
| **B: Design system, Shell, PWA** | `styles/{theme,shell,motion}.css`, `components/{ui,shell}`, `(marketing)` layout and landing page, `manifest.ts`, `sw.ts`, `~offline`, `public/icons`, `public/splash` | Final tokens and the component table above; frame navbar and mobile dock; SyncPip; view transitions; a `/styleguide` page; manifest (standalone, maskable icons, 180px apple icon); service worker (precache the shell and `/workout`, NetworkFirst for pages, CacheFirst for exercise images); an "Add to Home Screen" hint when not already installed | `e2e/shell.spec.ts` on an iPhone viewport; Lighthouse confirms the app is installable; no axe violations on the primitives; chart palette passes the `dataviz` check |
| **C: Exercise catalog** | `prisma/seed/{catalog,classify}.ts`, `overrides.json`, `api/catalog`, `exercises/**` pages, `components/exercises`, `server/catalog` | Classifies all ~870 exercises from free-exercise-db (Unlicense; Phase 0 confirms the license) into modality, equipment, load type, unilateral, bodyweight factor and standard lift; library with Free weight / Machine / Cable / Bodyweight tabs plus equipment and muscle filters and search; detail page. Components take props only, so E2 can reuse them in its exercise picker | Every source row is classified; tests against 40 hand-labelled exercises pass; reseeding keeps the same IDs; `e2e/catalog.spec.ts` |
| **D: Analytics core and fixtures** | `src/lib/analytics/**`, `src/lib/fixtures/**`, `prisma/seed/fixtures.ts` | Every analytics function and all 10 insight rules (with a cited constants file); a fixture history generator: a 16-week intermediate lifter with a deload, a planted bench stall, leg press at two gyms, a pin-labelled leg curl, weighted pull-ups, a weight cut with tape measurements, plus edge-case users; a demo-user seed | Coverage ≥ 95%; fast-check properties (e1RM rises with load and reps; volume doesn't depend on set order); planted signals are detected (bench stall yes, squat no, the two leg-press series stay separate) |
| **E1: Sync engine** | `src/lib/sync/**`, `src/server/{sync,prs}/**`, `src/client/{sync,db,repo}/**`, `api/sync` | HLC, merge, server apply, pull, derive, PR rebuild, Dexie schema, outbox, repo, engine triggers, `SyncProvider`, tombstone cleanup | Property test that two devices converge; integration tests on a Neon branch (replaying a batch is harmless, writes to another user's IDs are rejected, orphaned children are tombstoned, concurrent pushes never skip rows); fake-indexeddb client tests; `e2e/sync.spec.ts` (two browser contexts converge). **No UI** |

### Wave 2: three Sonnet 5.5 sessions in parallel
| Stream | Owns | Delivers | Accepted when |
|---|---|---|---|
| **E2: Workout logging** | `(workout)/workout`, `history/**`, `templates/**`, `settings/machines`, `exercises/new`, `exercises/[id]/edit`, `components/{workout,templates}` | Start a workout empty or from a template; exercise picker split by modality; MACHINE and CABLE exercises ask for a machine profile, defaulting to the last one used; set rows labelled by load type; "last time" values; RIR/RPE entry; a rest timer (absolute end time, Wake Lock); a live PR toast; supersets and reordering; a finish summary; templates CRUD; history; custom exercises; machine profiles; a `StartWorkoutCard` | `e2e/logging-offline.spec.ts` (WebKit iPhone, production build): go offline → log 9 sets → reload → data is still there → go online → the outbox drains → the server's history shows 9 sets |
| **F: Progress and Body** | `progress/**`, `components/{charts,progress,body}`, `server/queries/{progress,body,prs}.ts`, `server/actions/body.ts` | Per-exercise e1RM chart with forecast band, top set and volume; a machine-series picker; weekly sets per muscle against landmark bands; calendar heatmap; body page (trend, BF%, circumferences, Navy calculator); PR board; `WeekVolumeCard` and `BodyTrendCard` | Mapper unit tests on fixtures; `e2e/progress.spec.ts` as the demo user; every chart has a table fallback |
| **G: Insights and Learn** | `insights/**`, `(marketing)/learn/**`, `components/{insights,learn}`, `server/insights/**`, `server/actions/insights.ts`, `api/cron/insights` | Rule-based insight cards; the Claude weekly narrative (as described above); cron secured by `CRON_SECRET`; on-demand regeneration capped at 3 per week; `/learn` articles with citations; a `LatestInsightCard` | Unit tests with the Anthropic client mocked; one opt-in live test (`INSIGHTS_LIVE=1`); rate-limit and hash-dedupe tests; a numeric-grounding test |

### Wave 3: Integration and QA (one Sonnet 5.5 session; ownership checks are lifted)
- Builds `/today` from the cards the other streams export. Applies any change requests still queued.
- `e2e/journeys/**`: sign up → onboarding → offline workout → charts → insight.
- **Two-user isolation suite.** User A calls every query, action and sync path using user B's IDs; every call must return 404 or `rejected`.
- Lighthouse and axe budgets, Playwright visual snapshots, `design:accessibility-review`, `/security-review`.
- Deploy to Vercel production with a Neon main branch, plus cron.

---

## Prerequisites only Reece can do (before Phase 0)
1. Pick a permanent folder for the repo; this scratch workspace is temporary. A suggestion is `~/Developer/overload`, with a GitHub repo.
2. Create a Neon project and an API key (for neonctl branches), and a Vercel project linked to the repo.
3. Create a Google OAuth client, with redirect URIs for localhost and the Vercel domain.
4. Get a Resend API key. `onboarding@resend.dev` works for development.
5. Get an Anthropic API key.
6. Put all of these in `.env.local` yourself. Agents read `.env.example` and never handle the secret values.

## Verification
- **Every stream:** `pnpm check` (typecheck, lint, vitest), `pnpm ownership:check`, its own Playwright spec, and `pnpm build`.
- **Correctness:** fixture-based tests confirm the planted signals; property tests cover merge convergence and e1RM monotonicity; the security model is checked by the two-user isolation suite.
- **Offline:** the Playwright WebKit iPhone project runs an offline → reload → online cycle against a production build.
- **iPhone:**
  - The coordinator uses the **iOS Simulator** on the Vercel preview: Safari → Share → Add to Home Screen → launch → confirm it opens standalone, safe areas are respected, the dock sits above the home indicator, offline logging survives airplane mode, and passkey and Google sign-in work in standalone mode.
  - Reece repeats the same checklist on a real iPhone.
- **Visual:** compare `/styleguide` against reece-resnik.vercel.app side by side in the browser pane, in both themes, at 375px and 1280px.

## Top risks
| Risk | Mitigation |
|---|---|
| Upgrading to Prisma 8 by accident | Pin `^7`; `CLAUDE.md` forbids `prisma@latest` |
| Merge conflicts | Install all dependencies up front; frozen files; ownership checked in CI; merge in a fixed order |
| iOS quirks: timers pause in the background, separate cookie storage for installed apps, no install prompt | Timers use absolute end times; lead with passkeys and email sign-in; show an "Add to Home Screen" hint; never update the service worker mid-workout |
| Narrative invents numbers | Prompt contains only facts; numeric post-check; falls back to rules-only cards |
| Strength-standard data and formula coefficients | One cited constants file. Wilks2 and IPF GL bench-only coefficients are marked "[Verify]" and stay off until checked. Every comparison names its population |
| Neon pooling | Pooled URL plus `attachDatabasePool`; short transactions with a 15 s timeout; Vercel region matched to Neon |

---

## Appendix A: Prisma schema (frozen in Phase 0)

The auth models come from the Better Auth CLI, with every plugin enabled (email and password, Google, passkey). Domain back-relations are appended to `User`.

**Shared columns.** Every synced model (`Exercise`, `MachineProfile`, `BodyMetric`, `Template`, `TemplateExercise`, `Workout`, `WorkoutExercise`, `WorkoutSet`) carries:
- `hlc String`
- `fieldHlc Json @default("{}")`
- `version Int`
- `deletedAt DateTime?`
- `createdAt`
- `updatedAt`
- `@@index([userId, version])`

**Never accepted from the client:** `userId`, `version`, `hlc`, `fieldHlc`, denormalized foreign keys, `effectiveLoadKg`, `e1rmKg`.

```prisma
generator client { provider = "prisma-client"  output = "../src/generated/prisma" }
datasource db   { provider = "postgresql" }   // URLs live in prisma.config.ts (DIRECT_URL for CLI)

enum Sex { MALE FEMALE PREFER_NOT_TO_SAY }               // formula coefficients; PREFER_NOT → averaged coeffs, percentiles hidden
enum WeightUnit { KG LB }                                 // display/entry only; storage is kg
enum EffortScale { RIR RPE }                              // display only; stored as RIR (RPE = 10 − RIR)
enum ExperienceLevel { BEGINNER INTERMEDIATE ADVANCED }
enum TrainingGoal { HYPERTROPHY STRENGTH GENERAL }
enum BodyFatMethod { SCALE BIA DEXA NAVY_TAPE CALIPERS VISUAL }
enum Modality { FREE_WEIGHT MACHINE CABLE BODYWEIGHT BAND OTHER }
enum Equipment { BARBELL DUMBBELL KETTLEBELL EZ_BAR TRAP_BAR PLATE MEDICINE_BALL
                 SMITH_MACHINE MACHINE_SELECTORIZED MACHINE_PLATE_LOADED
                 CABLE BODYWEIGHT BAND EXERCISE_BALL FOAM_ROLL OTHER }
enum LoadType { TOTAL PER_IMPLEMENT PLATES_PER_SIDE STACK BODYWEIGHT_PLUS NONE }
enum TrackingType { LOAD_REPS REPS DURATION DISTANCE_DURATION }
enum Mechanic { COMPOUND ISOLATION }
enum Force { PUSH PULL STATIC }
enum ExerciseCategory { STRENGTH POWERLIFTING OLYMPIC_WEIGHTLIFTING STRONGMAN PLYOMETRICS STRETCHING CARDIO }
enum Muscle { ABDOMINALS ABDUCTORS ADDUCTORS BICEPS CALVES CHEST FOREARMS GLUTES HAMSTRINGS LATS
              LOWER_BACK MIDDLE_BACK NECK QUADRICEPS SHOULDERS TRAPS TRICEPS }
enum MuscleRole { PRIMARY SECONDARY }                     // weekly sets: 1.0 / 0.5
enum StandardLift { SQUAT BENCH_PRESS DEADLIFT OVERHEAD_PRESS BARBELL_ROW PULL_UP DIP }
enum SetType { WARMUP WORKING DROP AMRAP }                // WARMUP excluded from volume/PRs; DROP excluded from e1RM/PRs
enum PrType { E1RM MAX_LOAD REP_MAX MAX_REPS MAX_SET_VOLUME MAX_SESSION_VOLUME }
enum E1rmFormula { EPLEY BRZYCKI }
enum InsightStatus { PENDING READY FAILED }
enum InsightTrigger { CRON ON_DEMAND }

model Profile {            // not synced; Server Actions only
  userId String @id
  sex Sex?   birthDate DateTime? @db.Date   heightCm Decimal? @db.Decimal(5,1)
  unitPreference WeightUnit @default(KG)   effortScale EffortScale @default(RIR)
  experience ExperienceLevel?   goal TrainingGoal?   e1rmFormula E1rmFormula @default(EPLEY)
  timezone String @default("UTC")   defaultRestSec Int @default(120)   insightsEnabled Boolean @default(true)
  onboardedAt DateTime?   createdAt DateTime @default(now())   updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
model SyncState { userId String @id  version Int @default(0)  gcFloorVersion Int @default(0)  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade) }
model CatalogMeta { id Int @id @default(1)  version Int  updatedAt DateTime @updatedAt }

model Exercise {           // userId null = global catalog
  id String @id @db.Uuid   userId String?   sourceId String? @unique   slug String   name String   aliases String[]
  modality Modality   equipment Equipment   loadType LoadType   tracking TrackingType @default(LOAD_REPS)
  bodyweightFactor Decimal? @db.Decimal(3,2)   isUnilateral Boolean @default(false)
  mechanic Mechanic?   force Force?   level ExperienceLevel?   category ExerciseCategory   standardLift StandardLift?
  instructions String[]   images String[]
  /* sync mixin */  muscles ExerciseMuscle[]   /* + relations */
  @@index([modality, equipment])
}
model ExerciseMuscle { exerciseId String @db.Uuid  muscle Muscle  role MuscleRole
  exercise Exercise @relation(fields: [exerciseId], references: [id], onDelete: Cascade)
  @@id([exerciseId, muscle])  @@index([muscle, role]) }

model MachineProfile {     // per-user gym/brand instance; keys machine progression series
  id String @id @db.Uuid   userId String   name String   gymName String?   brand String?
  exerciseId String? @db.Uuid   labelUnit WeightUnit?   pinStepKg Decimal? @db.Decimal(6,3)
  baseLoadKg Decimal? @db.Decimal(6,2)   notes String?   /* sync mixin */
  @@index([userId, exerciseId])
}
model BodyMetric {
  id String @id @db.Uuid   userId String   measuredAt DateTime   localDate DateTime @db.Date
  weightKg Decimal? @db.Decimal(6,2)   bodyFatPct Decimal? @db.Decimal(4,1)   bodyFatMethod BodyFatMethod?
  neckCm/waistCm/hipCm/chestCm/armCm/thighCm/calfCm Decimal? @db.Decimal(5,1)   notes String?   /* sync mixin */
  @@index([userId, localDate])
}
model Template { id String @id @db.Uuid  userId String  name String  notes String?  folder String?  position String /* fractional index */  /* sync mixin */ }
model TemplateExercise {
  id String @id @db.Uuid  userId String  templateId String @db.Uuid  exerciseId String @db.Uuid  machineProfileId String? @db.Uuid
  position String  warmupSets Int @default(0)  workingSets Int @default(3)  repMin Int?  repMax Int?
  targetRir Decimal? @db.Decimal(3,1)  restSec Int?  supersetKey String?  notes String?  /* sync mixin */
  @@index([templateId, position])
}
model Workout {
  id String @id @db.Uuid  userId String  templateId String? @db.Uuid  title String?
  startedAt DateTime  endedAt DateTime?  localDate DateTime @db.Date  timezone String
  bodyweightKg Decimal? @db.Decimal(6,2)  isDeload Boolean @default(false)  notes String?  /* sync mixin */
  @@index([userId, localDate])
}
model WorkoutExercise {
  id String @id @db.Uuid  userId String  workoutId String @db.Uuid  exerciseId String @db.Uuid
  machineProfileId String? @db.Uuid  position String  supersetKey String?  restSec Int?  notes String?  /* sync mixin */
  @@index([workoutId, position])  @@index([userId, exerciseId])
}
model WorkoutSet {
  id String @id @db.Uuid  userId String  workoutExerciseId String @db.Uuid
  // server-derived
  workoutId String @db.Uuid  exerciseId String @db.Uuid  machineProfileId String? @db.Uuid
  seriesKey String  localDate DateTime @db.Date  effectiveLoadKg Decimal? @db.Decimal(7,3)  e1rmKg Decimal? @db.Decimal(7,3)
  // client-writable
  position String  setType SetType @default(WORKING)  weightKg Decimal? @db.Decimal(7,3)  inputUnit WeightUnit?
  reps Int?  rir Decimal? @db.Decimal(3,1)  durationSec Int?  distanceM Decimal? @db.Decimal(9,2)
  completedAt DateTime? /* null = planned */  notes String?  /* sync mixin */
  @@index([userId, exerciseId, localDate])  @@index([userId, seriesKey, completedAt])
  @@index([userId, localDate])  @@index([workoutExerciseId, position])
}
model PersonalRecord {     // server-derived, rebuilt per seriesKey in the sync transaction
  id String @id @default(uuid(7)) @db.Uuid  userId String  exerciseId String @db.Uuid  machineProfileId String? @db.Uuid
  seriesKey String  type PrType  reps Int @default(0)  value Decimal @db.Decimal(12,3)  previousValue Decimal? @db.Decimal(12,3)
  setId String? @db.Uuid  workoutId String @db.Uuid  achievedAt DateTime  computedAt DateTime @default(now())
  @@unique([userId, seriesKey, type, reps])  @@index([userId, achievedAt])
}
model InsightReport {
  id String @id @default(uuid(7)) @db.Uuid  userId String  weekStart DateTime @db.Date
  status InsightStatus @default(PENDING)  trigger InsightTrigger  factsVersion Int  facts Json  factsHash String
  narrative Json?  model String?  promptVersion String?  inputTokens Int?  outputTokens Int?  error String?
  onDemandCount Int @default(0)  generatedAt DateTime?  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
  @@unique([userId, weekStart])  @@index([status, createdAt])
}
```
_(This block is shorthand: several fields sit on one line, and `/* sync mixin */` stands for the shared columns listed above. Phase 0 expands it into valid Prisma and adds every relation and `onDelete: Cascade` on `User`.)_

---

## Appendix B: Research brief (Phase 0 copies this into `docs/research.md`)

**Hypertrophy vs. hyperplasia**
- **Hypertrophy** means existing fibers get larger. The evidence for it is very strong: fiber cross-sectional area rises about 10–35% over 8–16 weeks (Jorgenson 2020).
- **Hyperplasia** means new fibers form. In animals it only appears under extreme overload, and even there the findings are disputed (Antonio & Gonyea 1993).
  - In humans there are no studies that count fibers before and after training.
  - Elite bodybuilders have about the same number of fibers as untrained people (MacDougall 1984).
  - A 2025 meta-analysis abstract found no significant change (Gowda).
  - **[Contested]** D'Antona argues that hyperplasia may contribute at elite levels.
- **Sarcoplasmic vs. myofibrillar hypertrophy:** plausible (Roberts 2020; Haun 2019), but no one can program for one over the other.
- **What the app says:** "Muscles grow mainly because fibers get larger; whether adults gain new fibers is unresolved and likely minor. Training well for size covers it."

**Training variables**

| Variable | Hypertrophy | Strength |
|---|---|---|
| Weekly volume | 10–20 fractional sets per muscle (direct set 1.0, indirect 0.5), with diminishing returns (Schoenfeld 2017; Pelland 2025; Baz-Valle 2022) | Steeper diminishing returns after about 4–10 sets per lift per week |
| Per-session ceiling | About 11 fractional sets per muscle (Remmert 2025, preprint, **[Contested]**) | — |
| Load | Similar growth from about 30% to 85% of 1RM when sets are taken close to failure | Heavier is better (≥ 80% of 1RM) |
| Effort | 0–3 RIR; failure adds very little (Robinson 2024; Refalo 2023) | — |
| Frequency | Doesn't matter when volume is equal | Clearly helps, especially going from 1 to 2 sessions a week (Schoenfeld 2019; Pelland 2025) |
| Rest | 2–5 minutes for strength work (Singer 2024) | 2–5 minutes |

- **RIR estimates** are least reliable on sets above 15 reps and at RIR of 4 or more.
- **Progressing load:**
  - Double progression with the 2-for-2 rule (NSCA): add load when the last set beats the target by 2 reps in two sessions in a row.
  - Increments are 2–10%: about 1–2.5 kg for upper body and 2.5–5 kg for lower body.
  - Machine stack jumps can exceed 10%; in that case add reps first.

**e1RM formulas**

| Formula | Equation |
|---|---|
| Epley | `w(1 + r/30)` |
| Brzycki | `36w/(37 − r)` |
| Lombardi | `w·r^0.10` |
| Mayhew | `100w/(52.2 + 41.9e^(−0.055r))` |
| Wathan | `100w/(48.8 + 53.8e^(−0.075r))` |

- Formulas are most accurate at 10 reps or fewer, best at 3–6 (Reynolds 2006).
- They underestimate the deadlift by 9–14% (LeSuer 1997).
- 1RM test-retest varies by a median of 4.2% (Grgic 2020).
- A model fitted to the individual lifter beats pooled formulas (Mitter 2022).

**Relative strength scores**
- **DOTS:** `500·total / (a + bx + cx² + dx³ + ex⁴)`, where x is bodyweight in kg.
  - Men: a = −307.75076, b = 24.0900756, c = −0.1918759221, d = 0.0007391293, e = −0.000001093
  - Women: a = −57.96288, b = 13.6175032, c = −0.1126655495, d = 0.0005158568, e = −0.0000010706
  - Clamp bodyweight to 40–210 kg (men) or 40–150 kg (women).
- **IPF GL (classic):** `100·total / (A − B·e^(−C·BW))`
  - Men: A = 1199.72839, B = 1025.18162, C = 0.00921
  - Women: A = 610.32796, B = 1045.59282, C = 0.03048
  - Check value: 90 kg, 700 kg total → 93.06
  - Equipped men: 1236.25115 / 1449.21864 / 0.01644. Equipped women: 758.63878 / 949.31382 / 0.02435.
  - Bench-only and Wilks2 coefficients: **[Verify]** before enabling.
- **Allometric:** lift ÷ BW^0.67 (Jaric 2002).
- **Use only for:** barbell squat, bench press and deadlift.

**Progression curves**
- **Steele 2022** (n = 14,690): strength follows a linear-log curve. Gains were about 30–50% in year 1, and strength practically plateaued after 1–2 years. Sex, age and bodyweight barely changed the shape.
- **Latella 2020/2023** (powerlifters): about 0.15 kg/day (men) and 0.12 kg/day (women); about 7.5–12.5% gain in the first year of competing.
- **Swinton 2021:** across training studies the average strength gain is 14.3%, a useful population prior.
- **Muscle-gain rate heuristics** (coaches' estimates, not peer-reviewed, treat as upper bounds):
  - McDonald: about 20–25 lb in year 1, 10–12 in year 2, 5–6 in year 3, then 2–3 per year; halve for women.
  - Aragon: monthly gain of 1–1.5% of bodyweight (beginners), 0.5–1% (intermediate), 0.25–0.5% (advanced).
- **Forecast model:** Bayesian linear regression on ln(t + t₀) with population priors. Avoid an exponential curve toward a fixed ceiling, and avoid Banister fitness-fatigue models (they overfit sparse data).

**Sex, age and body composition**
- **Sex:**
  - Women are about 52% as strong as men in the upper body and 66% in the lower body, mostly because men's fibers are larger (Miller 1993).
  - In relative terms, hypertrophy is the same between sexes (effect size 0.07) and upper-body strength gains are larger in women (Roberts 2020).
  - So the app forecasts in **percent** without sex-specific curve shapes, and compares absolute numbers against sex-specific norms.
- **Age:** lifters aged 50 and over gained about 1.1 kg of lean mass over about 20 weeks (Peterson 2011).
- **FFMI:**
  - LBM = BW·(1 − BF%)
  - FFMI = LBM / h²
  - Normalized FFMI = FFMI + 6.1·(1.8 − h)
  - Drug-free ceiling: about 25 for men (Kouri 1995, **[Contested]**); 97.5th percentile about 23.9 for women (Harty 2019).
  - ±4 points of body fat shifts FFMI by about ±1.
- **US Navy tape method (cm, log base 10):**
  - Men: `495/(1.0324 − 0.19077·log(waist − neck) + 0.15456·log(h)) − 450`
  - Women: `495/(1.29579 − 0.35004·log(waist + hip − neck) + 0.22100·log(h)) − 450`
  - Standard error about 3.5%.
- **Deurenberg (BMI-based):** overestimates body fat in lifters, so it's never used for FFMI.
- **Strength-standard sources:**
  - StrengthLevel: data-driven, skews high.
  - OpenPowerlifting: competitors only.
  - ExRx/Kilgore: expert-derived.
  - Symmetric Strength: formula-based.
  - Always label which population a comparison uses.

**Machines vs. free weights**
- Hypertrophy is similar on both. Strength gains are specific to the mode trained (Haugen 2023).
- Load isn't comparable across machine brands (cams, lever arms, friction), across cable pulley ratios, or between plate-loaded sleds with and without the sled weight.
- **App rules:**
  - Machine series are keyed per `MachineProfile`.
  - Machine sets count fully toward weekly muscle volume.
  - Machine lifts get no DOTS score, no percentile, and no conversion to barbell equivalents.
  - A new gym or machine starts a new series.

**Citations** (stream G checks each link before using it on `/learn`)

*Hypertrophy and hyperplasia*
- Jorgenson 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7408414/
- Antonio & Gonyea 1993: https://pubmed.ncbi.nlm.nih.gov/8107539/
- MacDougall 1984: https://experts.mcmaster.ca/scholarly-works/236035
- Gowda 2025 (abstract): https://rdw.rowan.edu/stratford_research_day/2025/may1/194
- D'Antona: https://www.physoc.org/magazine-articles/muscle-mass-at-the-top-a-likely-role-for-fibre-hyperplasia-in-humans/
- Roberts 2020, sarcoplasmic hypertrophy: https://pmc.ncbi.nlm.nih.gov/articles/PMC7372125/

*Volume, effort, frequency and rest*
- Schoenfeld 2017, volume: https://paulogentil.com/pdf/Dose-response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases%20in%20muscle%20mass%20-%20A%20systematic%20review%20and%20metaanalysis.pdf
- Schoenfeld 2017, load: https://pubmed.ncbi.nlm.nih.gov/28834797/
- Pelland 2025 (doi 10.1007/s40279-025-02344-w): https://sponet.de/sponet/Record/4097139?lng=en
- Baz-Valle 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/
- Remmert 2025 (preprint): https://sportrxiv.org/index.php/server/preprint/view/537
- Robinson 2024 (summary): https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/
- Refalo 2023: https://openrepository.aut.ac.nz/items/78679612-6ff4-4d00-95d1-7920d072a760/full
- Singer 2024: https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/text
- Zourdos 2016: https://pubmed.ncbi.nlm.nih.gov/30747900/
- Bell 2023, deloading: https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/

*1RM estimation and relative strength*
- Grgic 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/
- Mitter 2022: https://research.birmingham.ac.uk/en/publications/modeling-the-relationship-between-load-and-repetitions-to-failure/
- e1RM formulas review: https://arxiv.org/pdf/2603.17495
- DOTS: https://coachway.io/tools/dots-calculator/
- IPF GL: https://coachway.io/tools/ipf-gl-points-calculator/
- Jaric 2002, allometric scaling: https://nsca.com/education/articles/kinetic-select/normalizing-fitness-data

*Progression over time*
- Steele 2022: https://www.strongerbyscience.com/?p=57447
- Latella 2020: https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836/
- Latella 2023: https://www.sportrxiv.org/index.php/server/preprint/view/218
- Swinton 2021: https://sportrxiv.org/index.php/server/preprint/view/11

*Sex, age and body composition*
- Miller 1993: https://pubmed.ncbi.nlm.nih.gov/8477683/
- Roberts, Nuckols & Krieger 2020: https://pubmed.ncbi.nlm.nih.gov/32218059/
- Refalo 2025: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11869894/
- Peterson 2011: https://pubmed.ncbi.nlm.nih.gov/20543750/
- Kouri 1995 (via McDonald): https://bodyrecomposition.com/muscle-gain/another-look-at-the-ffmi/
- Harty 2019: https://digitalcommons.lindenwood.edu/faculty-research-papers/121
- Hodgdon & Beckett 1984, Navy tape method: https://apps.dtic.mil/sti/pdfs/ADA143890.pdf
- Deurenberg: https://pmc.ncbi.nlm.nih.gov/articles/PMC8980724/
- StrengthLevel methodology: https://strengthlevel.com/about

*Machines vs. free weights and guidelines*
- Haugen 2023: https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/
- ACSM 2026 Position Stand: https://www.newswise.com/articles/acsm-unveils-landmark-2026-resistance-training-guidelines-first-update-in-17-years

*Cited from memory, no link found yet:* Haun 2019, Helms 2014, Schoenfeld 2016 (rest intervals), Morton 2018. Stream G finds the sources before citing them.
