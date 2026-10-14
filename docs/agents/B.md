# Stream B: Design system, Shell, PWA

**Wave 1. Model: Sonnet 5.5. Dev-server port: 3002** (`pnpm dev -p 3002`; set `PORT=3002` for Playwright).

## Your goal

Own the visual system and the app shell: final tokens, the shared UI components, the frame navbar / mobile dock, view transitions, the `/styleguide`, the PWA (manifest, icons, service worker, offline page, install hint) and the marketing landing page. Plan sections: "Design system", "Routes", Wave 1 table row B, "Components".

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.
4. Use the **`dataviz` skill** (invoke it via the Skill tool) when validating the chart palette. Also keep `design:accessibility-review` in mind: Wave 3 runs it on key screens.

## Setup (your own git worktree, branch `b/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch B                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3002
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/B-*.md`; colocated tests inside your paths are yours):

- `src/styles/theme.css`
- `src/styles/shell.css`
- `src/styles/motion.css`
- `src/styles/primitives.css`
- `src/components/ui/**`
- `src/components/shell/**`
- `src/components/primitives/**`
- `src/app/(marketing)/*.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/manifest.ts`
- `src/app/sw.ts`
- `src/app/serwist/**`
- `src/app/~offline/**`
- `src/app/styleguide/**`
- `src/app/not-found.tsx`
- `src/app/error.tsx`
- `src/lib/theme.*`
- `public/**`
- `tools/pwa/**`
- `e2e/shell.spec.ts`

`pnpm ownership:check --stream=B` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- `requireUser()`, `requireSessionInfo()`, `withUser()`, `withUserRoute()`, branded `UserCtx` (`src/server/auth/session.ts`), `prisma` (`src/server/db.ts`), mappers, `src/lib/{units,dates,ids}.ts`.
- The four primitives `HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` (`src/components/primitives/*`) and the daisyUI themes in `src/styles/theme.css`.
- Your own CSS partial in `src/styles/` (already imported by `globals.css`).
- Phase 0 tokens: `src/styles/theme.css` has the plan's exact values; secondary (slate blue) and accent (ochre) are **provisional** for you to finalize.
- Phase 0 PWA wiring that already builds: `src/app/serwist/[path]/route.ts` (`@serwist/turbopack`, verified with `next build`), a minimal `src/app/sw.ts`, `src/app/~offline/page.tsx`, `SerwistProvider` in the (frozen) root layout. You own and extend all of it; only the root layout itself is frozen.
- `useSyncStatus()` from `@/client/sync` (a safe no-op until E1 lands: returns `idle`) for SyncPip, and `isWorkoutActive()` from `@/lib/pwa`.
- Fonts: Newsreader has `tnum` (verified): use the `num` utility for numbers; Instrument Serif has none (static big numerals only). See CONTRACTS.md section 10.
- `src/app/(app)/layout.tsx` currently calls `requireUser()` and mounts `<SyncProvider userId>`: **keep both** when you replace the visual shell.

<!-- sig: src/contracts/sync.ts#SyncState,SyncStatus -->
```ts
// from src/contracts/sync.ts
export type SyncState = (typeof SYNC_STATES)[number];

export interface SyncStatus {
  state: SyncState;
  /** Outbox mutations not yet acknowledged by the server. */
  pendingCount: number;
  lastSyncedAt: IsoDateTime | null;
  lastError: string | null;
  /** Mutations the server rejected in the last sync (dead-lettered). */
  rejectedCount: number;
}
```

<!-- sig: src/client/sync/hooks.ts#useSyncStatus! -->
```ts
// from src/client/sync/hooks.ts
/** Live sync status for SyncPip and "N changes waiting" UI. */
export function useSyncStatus(): SyncStatus;
```

<!-- sig: src/lib/pwa.ts#isWorkoutActive! -->
```ts
// from src/lib/pwa.ts
/** True while a workout is active. A flag older than `maxAgeMs` (default 12 h) is treated as stale (crashed tab). */
export function isWorkoutActive(maxAgeMs = 12 * 60 * 60 * 1000): boolean;
```

<!-- sig: src/lib/theme.ts#applyTheme! -->
```ts
// from src/lib/theme.ts
/** Persist a choice (null = back to "follow the system") and apply it immediately. Client-only. */
export function applyTheme(choice: ThemeChoice | null): void;
```

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

<!-- sig: src/components/primitives/SectionHeader.tsx#SectionHeaderProps -->
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

## Deliverables

- **Final tokens** in `src/styles/theme.css`, keeping the plan's exact paper/ink/vermilion/primary values. Finalize secondary (cable = slate blue) and accent (bodyweight = ochre) for light and dark and verify contrast (AA) in both themes.
- **Component table** in `src/components/ui/**` (props documented in each file, accessible, 44px touch targets, visible vermilion focus ring, text inputs >= 16px): `Button` (primary, ink, ghost-underline, danger; default/hover/active-press/disabled/loading), `Field` + `NumberStepper` (text, number, weight with unit suffix, reps, RIR; steppers step by a `step` prop which callers fill from `defaultIncrement()`), `Stat` (sm/md/lg; PR variant with vermilion star; loading skeleton; Instrument Serif numeral + small Newsreader label), `Tabs` + `ModalityTabs` (Free weight / Machine / Cable / Bodyweight; vermilion bar under the selected tab), `Sheet`/`Modal` (bottom sheet on mobile, dialog on desktop; use native `<dialog>`), `Toast` (PRs, sync results, errors; `aria-live`), `SyncPip` (idle/syncing/offline/error/signed-out from `useSyncStatus()`; navigator.onLine aware). Do not change the four primitives' props.
- **Shell** in `src/components/shell/**` + `(app)/layout.tsx`: frame navbar (asymmetric vermilion border `border-t border-r-4 border-b-8 border-l-2`) on desktop; on mobile a daisyUI `dock` with the same frame above `env(safe-area-inset-bottom)`; landmarks (`header`, `nav`, `main`), skip link, theme toggle (`applyTheme`), `SyncPip`, avatar with `ring-2 ring-vermilion ring-offset-6`, vermilion animated link underline with the 44px `tap-target` hit area. Nav items: Today, Exercises, History, Progress, Insights, Settings, plus a prominent Start workout action (`/workout`). Grayscale fixed photo backdrop on marketing/auth/onboarding only (never on logging screens).
- **Motion** (`motion.css`): view-transition page slides (`--page-out`, `--page-in`, `--ease-out`), fully disabled for `prefers-reduced-motion`.
- **`/styleguide`** page (`src/app/styleguide/page.tsx`) rendering every token and component in both themes. Used for the side-by-side comparison with reece-resnik.vercel.app at 375px and 1280px.
- **Marketing landing page** (`(marketing)/layout.tsx` + `page.tsx`): the portfolio look, honest copy about what the app does. (`/learn/**` is stream G's.)
- **PWA**: `src/app/manifest.ts` (standalone, `start_url: "/today"`, theme/background colours, maskable icons, categories), icons in `public/icons` (192, 512, maskable 512, 180px apple-touch-icon, favicon) generated by a script in `tools/pwa/` using the installed `sharp` (commit the generated PNGs), iOS splash images in `public/splash` (a reasonable set of common iPhone sizes + `apple-touch-startup-image` link tags emitted from `(app)`/`(workout)` metadata, not the root layout).
- **Service worker** `src/app/sw.ts` (+ extend `serwist/[path]/route.ts` precache entries): precache the app shell and `/workout`, `NetworkFirst` for pages, `CacheFirst` for exercise images (`https://raw.githubusercontent.com/yuhonas/free-exercise-db/**`, opaque responses allowed), `/~offline` fallback. **Never activate an update mid-workout**: set `skipWaiting: false`; the shell posts `{type: "SKIP_WAITING"}` to the waiting worker only when `isWorkoutActive()` is false, then reloads on `controllerchange`.
- **"Add to Home Screen" hint** for iOS Safari when not installed (not `display-mode: standalone`, not `navigator.standalone`), dismissible and remembered.

**Notes.** Verify visually in the built-in browser pane at 375px and 1280px in both themes against https://reece-resnik.vercel.app. Components must work without JavaScript where they are static. The portfolio uses square corners everywhere, flat surfaces, `--shadow-hard: 6px 6px 0 var(--color-vermilion)`; `HardCard` is the reference.

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass; `pnpm ownership:check --stream=B` passes.
2. `PORT=3002 E2E_PROD=1 pnpm exec playwright test e2e/shell.spec.ts` on the iPhone viewport project (`webkit-iphone`; `pnpm exec playwright install webkit` is allowed) and chromium: nav works, the dock sits above the safe area, SyncPip renders, the theme toggle persists, the `~offline` page is served when offline (production build).
3. No axe violations on the primitives and every UI component (use `@axe-core/playwright` against `/styleguide` in both themes).
4. Lighthouse (installed `lighthouse` package) against the production build: PWA installability passes (manifest + service worker + icons). Paste the relevant audit lines in your report.
5. **Chart palette**: before reporting, load the `dataviz` skill and use it to validate the data-viz palette in BOTH themes (modalities: free weight = vermilion, machine = ink/graphite, cable = slate blue, bodyweight = ochre; forecast dashed with 80% band at 12% opacity and 50% band at 22%; PR markers filled vermilion stars). Export the validated palette as CSS variables in `theme.css` (`--chart-free-weight`, `--chart-machine`, `--chart-cable`, `--chart-bodyweight`, `--chart-forecast`, `--chart-pr`) for stream F, and include the validator output in your report.

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `src/app/layout.tsx` (frozen; if the head needs something else, file a change request), `src/server/auth/session.ts`, `src/client/sync/**` (E1: you only consume `useSyncStatus`), anything under `(auth)`, `(onboarding)`, `settings/*` (A).

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/B-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=B` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).
