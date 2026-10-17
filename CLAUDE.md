# CLAUDE.md: Overload repo rules

Overload is a multi-user fitness web app (Next 16, React 19, TypeScript 6, Tailwind 4 + daisyUI 5, Prisma 7, Better Auth, Dexie offline sync, Vercel + Neon). The plan is `docs/PLAN.md`; the evidence behind insights is `docs/research.md`; the frozen interfaces are `CONTRACTS.md`. Every session also reads its brief: `docs/agents/<stream>.md`. `AGENTS.md` (written by `next dev`) points at the Next 16 docs shipped in `node_modules/next/dist/docs/`: consult them before using Next APIs from memory (this is Next 16: `proxy.ts`, async `headers()`/`params`, Turbopack).

## Hard rules

1. **pnpm only.** Never run npm, npx, yarn or `corepack prepare`. Run tools as `pnpm exec <tool>` or the package scripts. `packageManager` is pinned in `package.json`.
2. **Never run `prisma@latest`, `npx prisma@latest`, or install any other major version of Prisma.** `latest` on npm is an 8.0 RC with a different API. The repo is on `prisma@^7` / `@prisma/client@^7` (7.10). Ignore any "update available" banner the Prisma CLI prints.
3. **TypeScript stays 6.0.x** (typescript-eslint does not support 7). Node 24.
4. **Never add, remove or upgrade a dependency.** All dependencies for all waves were installed in Phase 0. `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml` are frozen. If something is missing, file a change request.
5. **Secrets.** Never ask for, create, print, log, commit or hard-code secret values. `.env.local` is the owner's; read `.env.example` for what exists. If a task needs a credential that is not in `.env.local`, stop and report it (`PENDING: needs <VAR>`).
6. **Stay inside your stream's paths** (see "Ownership"). Never edit another stream's files or any frozen file.
7. **Worktrees never run `prisma migrate dev`** and never edit `prisma/schema.prisma` or `prisma/migrations/**`. Use `pnpm db:deploy` (migrate deploy) against your own Neon branch.
8. **Do not push, create remote repos, or deploy** unless your brief says so.

## Ownership and frozen files

`ownership.json` maps path globs to streams (A, B, C, D, E1, E2, F, G; W3 is unrestricted). Run `pnpm ownership:check --stream=<X>` before reporting done: it diffs your branch (commits, working tree and untracked files) against `main` and fails on any path outside your globs. CI runs it on PRs from stream branches (`<stream>/<topic>`, e.g. `e1/sync-engine`).

**Frozen after Phase 0** (change requests only): `package.json`, the lockfile, `pnpm-workspace.yaml`, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/server/auth/session.ts` + `ctx.ts`, `src/app/layout.tsx`, `src/styles/globals.css`, `src/lib/{units,dates,ids}.ts`, `src/server/{db,env}.ts`, `src/server/mappers/**`, `src/server/queries/facts.ts`, config files (`tsconfig`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `prisma.config.ts`, `postcss.config.mjs`, `vercel.json`), `.github/**`, `scripts/**`, `docs/**`, `CLAUDE.md`, `CONTRACTS.md`, `ownership.json`. After Wave 1, schema changes must be **additive**.

There are no `index.ts` barrels that re-export another stream's files. Import the specific module (`@/contracts/sync`, `@/lib/analytics/forecast`). Each stream has its own CSS partial in `src/styles/`.

## Change requests

When you need a frozen file or another stream's file changed:

1. Write `change-requests/<STREAM>-<n>.md` (n = 1, 2, …) containing: **What** (the exact diff or the new signature), **Why** (what is blocked and which requirement it serves), **Workaround** (what you do meanwhile).
2. **Keep working** with the workaround. Do not edit the frozen file yourself, even locally.
3. Mention it in your report. The coordinator applies change requests at wave boundaries (or mid-wave when blocking); after that, `git rebase main`.

## Architecture rules (enforced by ESLint and tests)

* `src/lib/**` is **pure** TypeScript: no react, next, `server-only`, Dexie, Better Auth, Anthropic, Resend, Node built-ins, and nothing from `src/server`, `src/client`, `src/components` or `src/app`. It runs in the browser and on the server.
* The **Prisma client** (`@/generated/prisma/*`, `@prisma/client`) is imported only under `src/server/**` and `prisma/**`. Elsewhere use the enum mirrors and Row types in `src/contracts/**`.
* **Decimal never leaves `src/server`.** Mappers (`src/server/mappers`) convert to `number`. Never import `decimal.js` or `Prisma.Decimal` outside `src/server`.
* `src/client/**` must not import `src/server/**`; `src/server/**` must not import `src/client/**` or `src/components/**`.
* **No `userId` field in any Zod input schema** (an ESLint rule and a contracts test fail on it). The user always comes from `requireUser()` / `withUser()` / `withUserRoute()` (`src/server/auth/session.ts`), as a branded `UserCtx`. Every query, Server Action and sync function takes `ctx: UserCtx` and filters with `where: { userId: ctx.id }`. Never accept `userId`, `version`, `hlc`, `fieldHlc`, `effectiveLoadKg`, `e1rmKg`, `seriesKey` or denormalized foreign keys from a client. Fields schemas are strict objects and reject them.
* `proxy.ts` only redirects early on cookie presence. It is **not** the security check.
* **Server Actions** only for online forms (profile, settings, body metrics, regenerate insight). **Sync and the catalog are route handlers** (action ids change every deploy; an offline client on an older bundle must keep working).
* Server-only modules start with `import "server-only"` (not in files the Better Auth CLI or seed scripts load, e.g. `db.ts`, `auth.ts`).
* Weights are kg in the database and in analytics; convert with `src/lib/units.ts` at the UI edge. Group by `Workout.localDate`, ISO weeks (Monday to Sunday). Numbers in the UI use the `num` utility (tabular figures). Text inputs are at least 16px (iOS zoom).
* Design ("Calibrated Dial", spec `docs/design/calibrated-dial-handoff.html`): Archivo only (variable `wght` and `wdth`; display type is `font-stretch: 62%`, italic 850, via the `type-*` utilities), the `overload-floor` (dark) and `overload-daylight` (light) themes, 4 px (`--radius-field`) and 6 px (`--radius-box`) radii, no hard shadows. Plate colours (`--plate-*`, and primary/secondary/accent/success) appear on plates, lifts and data only, never as decoration, and plate blue is never small text on dark. Borders that mark a control's edge use `--color-line-strong`. Tokens live in `src/styles/theme.css`; reference them, never hex values.

## Commands

| Command | What |
|---|---|
| `pnpm dev -p <port>` | dev server (ports: A 3001, B 3002, C 3003, D 3004, E1 3005; Wave 2: E2 3001, F 3002, G 3003) |
| `pnpm check` | typecheck + lint + unit/DOM tests: **must pass before you report done** |
| `pnpm build` | production build: must pass |
| `pnpm test:integration` | tests against a real database (needs your Neon branch in `.env.local`) |
| `pnpm test:e2e` | Playwright (`PORT=<your port>`; `E2E_PROD=1` for production-build specs) |
| `pnpm ownership:check --stream=X` | path ownership check |
| `pnpm db:branch <stream>` | create/reuse this worktree's Neon branch, write `.env.local` (needs `NEON_API_KEY`, `NEON_PROJECT_ID`) |
| `pnpm db:deploy` / `pnpm db:seed` | apply migrations / seed the catalog on your branch |
| `pnpm docs:sync` | regenerate signature blocks in CONTRACTS.md / briefs (coordinator only; docs are frozen) |

## Style

Match the surrounding code: TypeScript strict, no `any`, `import type` for types, small modules, comments only for non-obvious intent. Tests live next to the code (`*.test.ts`, `*.dom.test.tsx` for jsdom, `*.integration.test.ts` for the database). Commit in logical chunks on your branch with clear messages; never rewrite shared history.

## Reporting

End every stream with the report format in your brief: what is done, test output, deviations from the brief, change requests filed. Be honest about anything not run or not verified.
