# Stream UX: in-app hints, template access, and a weight-loss goal

Post-launch feature stream, from owner feedback: "there needs to be hints and additional info on each page, because I'm not understanding a lot of the logging; add small hover hints throughout the app. There's no easy way to access and edit templates other than through the start workout page. Add a goal to lose weight and explain how the goals build muscle, get stronger, and general fitness differ."

Ownership is unrestricted for this stream (ownership.json): you may edit any file, frozen ones included, but keep each change minimal and list every frozen file you changed in your report.

## Read first

`CLAUDE.md`, `CONTRACTS.md`, `docs/research.md` (the evidence; cite from it), `docs/PLAN.md` ("Design system"). Load the `design:ux-copy` skill before writing hint text, and the `design:accessibility-review` skill before the a11y pass.

## Part 1: hints everywhere (the main deliverable)

The owner is a lifter but does not know this app's vocabulary. Every term or control that a new user could misread gets a short explanation next to it.

### Components (`src/components/ui/`)
- **`InfoHint`**: a small "i" button next to a label. Visual ~18px circle, **hit area ≥ 44px**. Opens a short popover:
  - desktop (`(hover: hover) and (pointer: fine)`): on hover and on keyboard focus;
  - touch: on tap; tapping again, tapping outside, or Escape closes it;
  - accessible: `<button aria-label="What is {term}?" aria-expanded aria-controls>`; the popover is `role="tooltip"` when hover/focus-only and a non-modal disclosure when opened by tap; content is also reachable by screen readers without hovering;
  - positions itself to stay on screen at 375px (flip above/below, clamp horizontally), never covers the field it explains while typing;
  - optional "Learn more" link to a `/learn` article.
- **`Term`**: inline dotted-underline text (`<Term id="rir">RIR</Term>`) with the same popover, for jargon inside sentences, table headers and chart titles.
- **`PageIntro`**: one or two plain sentences under a page header saying what the page is for and what to do first; dismissible per page (remembered in `localStorage`, wrapped in try/catch) with a "Show tips" toggle in Settings to bring them back.
- Style: square corners; ink background with paper text in the paper theme and the inverse in the ink theme (never small vermilion text); max width ~280px; 15–16px Newsreader; tabular numbers. Respect reduced motion.

### One glossary (single source of truth)
`src/lib/glossary.ts` (pure): `GLOSSARY: Record<TermId, { term: string; short: string; learn?: string }>` where `short` is at most ~200 characters, plain language, second person, no jargon inside the explanation. A test fails when any `TermId` used in the UI is missing, or any `short` is too long. Cover at least:
- Effort: RIR, RPE, target RIR, failure, hard set (and why warm-ups don't count), proximity to failure.
- Sets: warm-up, working, drop set, AMRAP, superset, top set, rest timer.
- Load labels: total, per hand (dumbbells/kettlebells), per side (plate-loaded), stack/pin number, bodyweight + added load, assisted (negative load), why machine weights are not comparable between machines.
- Machine profile (what it is, why your leg press at two gyms are two separate progressions).
- Progress: e1RM (estimated one-rep max, how it is computed from weight × reps × RIR), forecast and its 50%/80% bands, "needs 6 sessions", volume load, weekly sets per muscle (fractional: primary 1, secondary 0.5), the 10–20 target band, PRs (each PR type), deload, stall, double progression.
- Body: bodyweight trend (why it is smoothed), body-fat methods and their accuracy, Navy tape method, FFMI (and why it is shown as a range), DOTS (barbell lifts only).
- App: modality tabs (free weight / machine / cable / bodyweight), favorites, sync status states (synced, syncing, offline, error, signed out), units, effort scale, e1RM formula setting, training goal, experience level.

### Where hints go (every page)
Add a `PageIntro` to every signed-in page and hints next to every jargon label. At minimum:
- `/workout` (the priority): set row column headers (weight, reps, RIR), the set type control, the load label, "last time" ghost values, the rest timer, the machine chooser, the PR toast, superset grouping, finishing a workout. Add a first-run "How logging works" panel (3–4 short steps; dismissible; reopenable from a "?" in the workout header).
- `/templates` and the template editor: warm-up sets, working sets, rep range, target RIR, rest, superset key, machine.
- `/today`, `/history`, `/exercises` (filters, modality tabs, favorites, load type on cards), exercise detail.
- `/progress` and per-exercise pages: every chart title (`Term`), the forecast bands, the series picker; `/progress/body`, `/progress/prs`.
- `/insights`: each insight card's severity and its evidence line.
- Onboarding and settings: sex (why it's asked, used only for formulas), experience, goal (see Part 3), effort scale, e1RM formula, units, body-fat method.

## Part 2: templates are easy to reach and edit

- Add **Templates** to the primary navigation (`src/components/shell/nav.ts`): visible in the desktop navbar and in the mobile dock's "More" menu. Use an existing icon style.
- `/today`: a **Your templates** card listing up to 4 templates (most recently used first) with **Start** and **Edit** for each, an **All templates** link, and an empty state with **Create a template**.
- `/templates`: a clear **New template** button; each template row has **Start**, **Edit**, **Duplicate**, **Delete** (delete asks to confirm and is undoable through the existing tombstone restore if the repo supports it; otherwise a confirm dialog). Check what already exists in `src/app/(app)/templates/**` and `src/components/templates/**` before adding anything.
- `/history/[id]`: **Save as template** from a finished workout (exercises, set counts, rep ranges from what was logged).
- All of it works offline through the repo (templates are a synced entity already).

## Part 3: a weight-loss goal, and what each goal means

### The goal value
- Add `FAT_LOSS` to `enum TrainingGoal` (labels: "Lose weight (keep muscle)"). Additive migration written with `pnpm exec prisma migrate diff --from-schema <main's schema> --to-schema prisma/schema.prisma --script` (an `ALTER TYPE ... ADD VALUE`), never `migrate dev`. Update the enum mirror in `src/contracts/enums.ts` and every exhaustive `switch`/`Record<TrainingGoal, …>` (TypeScript will list them: `choices.ts`, `volume.ts`, `constants.ts`, `rules.ts`, fixtures). `pnpm db:deploy` must apply it on your Neon branch.

### What changes per goal (evidence-based, cite `docs/research.md`; verify any new source through the NCBI E-utilities or OpenAlex APIs, never invent a citation)
- `FAT_LOSS` training guidance: keep lifting heavy, mostly the same exercises; keep weekly sets per muscle near the hypertrophy band (do not cut volume aggressively); proximity to failure as for hypertrophy. If you add a lower "maintenance" volume floor, cite a verified source; otherwise reuse the hypertrophy band.
- New insight rule for `FAT_LOSS` (and shown for any goal when bodyweight is falling): **rate of loss** from the bodyweight trend. Target about 0.5–1.0% of bodyweight per week (Helms, Aragon & Fitschen 2014); flag faster than 1%/week ("risking muscle and strength"), and a stall (under ~0.25%/week for 3+ weeks of logged weigh-ins). Protein guidance stays at the cited ~1.6 g/kg/day (Morton 2018) or the range in `docs/research.md`. Never give calorie prescriptions or medical advice; keep the wording neutral about bodies.
- Existing rule 10 (losing weight while strength drops) now treats `FAT_LOSS` as the expected context.
- Strength forecasts on `FAT_LOSS`: label holding strength as "on track" (maintaining is the goal), not "behind".
- Insight facts and the Claude narrative prompt receive the goal and explain it in those terms.

### Explaining the goals
- Onboarding and Settings → Profile: the goal picker becomes four cards (Build muscle, Get stronger, General fitness, Lose weight), each with a two-line "what this changes" summary and a hint.
- New `/learn` article **"Choosing a goal"** with a comparison table across the four goals: what you're optimizing; typical rep ranges and load; weekly sets per muscle; effort (RIR); rest; frequency; what the app emphasizes in charts and insights; and how fast progress usually is. State plainly that the goals overlap (muscle and strength build each other), that weight loss is driven mainly by diet while lifting keeps the muscle, and that you can switch goals any time. Every number cited from `docs/research.md`.
- Link to it from the goal cards and from the `goal` glossary entry.

## Tests and acceptance

- Unit/DOM: `InfoHint` (hover on fine pointers, tap on touch, Escape, outside tap, focus, aria attributes), `PageIntro` dismissal, glossary completeness/length, goal-specific rules (the rate-of-loss rule on fixtures: fast, on target, stalled), enum parity test, template actions.
- e2e (users from `e2e/_support/user.ts`; run in your worktree only; full suite `E2E_PROD=1 pnpm test:e2e` on chromium and webkit-iphone in the background with output saved to a file):
  - tap an `InfoHint` on `/workout` on webkit-iphone → the explanation is visible and on screen; Escape/outside tap closes it; on chromium, hover and keyboard focus show it;
  - Templates is reachable from the navbar and from the dock's More menu; create → edit → start a template from `/templates`; Save as template from history;
  - onboarding with the "Lose weight" goal; the goal article renders.
- axe clean on every changed page in both themes, including with a hint open; touch targets ≥ 44px.
- Update the visual baselines that legitimately change (hint icons) on a production build.
- `pnpm check`, `pnpm build`, `pnpm test:integration`, `pnpm db:deploy` on your branch.

## Setup

`pnpm install --frozen-lockfile`, `pnpm db:branch UX` (writes `PORT=3005`), `pnpm db:deploy && pnpm db:seed`, then the demo fixtures seed. Never run e2e in the main checkout. Never print secrets.

## Checkpoint rule

Commit after every finished sub-step, at least every 30 minutes, even when tests are red: subject `wip(UX): <what>`, body `Done: …` and `Next: …`. Never end a turn or start a long command with uncommitted changes. If the machine load is very high, wait and retry; never report a load-induced timeout as a pass. If resumed, read `git log --format='%h %s%n%b' main..HEAD` first. Do not merge, rebase onto main, push or deploy; the coordinator merges, applies your migration to production, and deploys.

## Report

What's done; the list of pages with their hints; test counts per suite and project; every frozen file changed and why; new citations and how each was verified; anything not run or not verified.
