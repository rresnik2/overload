# Stream A: Auth, Profile, Onboarding

**Wave 1. Model: Sonnet 5.5. Dev-server port: 3001** (`pnpm dev -p 3001`; set `PORT=3001` for Playwright).

## Your goal

Turn the Phase 0 minimal email + password auth into the full auth system, build the onboarding wizard and the profile/security/account settings, and prove it with `e2e/auth.spec.ts`. Plan sections: "Routes", "Security boundary", Wave 1 table row A.

## Read first (in this order)

1. `CLAUDE.md` (repo rules, ownership, change requests) and `AGENTS.md` (Next 16 docs live in `node_modules/next/dist/docs/`; this is not the Next you remember).
2. `CONTRACTS.md` (frozen interfaces). The signatures below are copied from it.
3. `docs/PLAN.md` (the sections named in your deliverables) and, where you touch formulas or evidence, `docs/research.md`.

## Setup (your own git worktree, branch `a/<topic>`)

```bash
pnpm install --frozen-lockfile          # never add or change dependencies
pnpm db:branch A                 # your own Neon branch -> .env.local (needs NEON_API_KEY + NEON_PROJECT_ID)
pnpm db:deploy && pnpm db:seed          # migrate + seed 30 starter exercises on that branch
pnpm dev -p 3001
```

If `NEON_API_KEY` / `NEON_PROJECT_ID` are not available, you cannot create the branch: do all database-free work (unit tests, types, UI against fixtures), mark every database-dependent acceptance item **PENDING (needs Neon credentials)** in your report, and never invent or ask for secret values.

## Paths you own

Only these paths may change on your branch (plus `change-requests/A-*.md`; colocated tests inside your paths are yours):

- `src/app/(auth)/**`
- `src/app/(onboarding)/**`
- `src/app/(app)/settings/*.tsx`
- `src/app/(app)/settings/profile/**`
- `src/app/(app)/settings/security/**`
- `src/app/(app)/settings/account/**`
- `src/app/api/auth/**`
- `src/proxy.ts`
- `src/server/auth/auth.ts`
- `src/server/email/**`
- `src/server/profile/**`
- `src/server/actions/profile.ts`
- `src/client/auth/**`
- `src/components/auth/**`
- `src/components/profile/**`
- `src/styles/auth.css`
- `e2e/auth.spec.ts`
- `e2e/helpers/mailbox.ts`

`pnpm ownership:check --stream=A` must pass.

## What you can rely on

Everything below is frozen and implemented (or stubbed with a frozen signature) in `main`.

- `requireUser()`, `requireSessionInfo()`, `withUser()`, `withUserRoute()`, branded `UserCtx` (`src/server/auth/session.ts`), `prisma` (`src/server/db.ts`), mappers, `src/lib/{units,dates,ids}.ts`.
- The four primitives `HardCard`, `SectionHeader`, `PageHeader`, `EmptyState` (`src/components/primitives/*`) and the daisyUI themes in `src/styles/theme.css`.
- Your own CSS partial in `src/styles/` (already imported by `globals.css`).
- Better Auth is configured in `src/server/auth/auth.ts` (email+password, optional Google, `@better-auth/passkey`, database rate limiting, 30-day sessions, `nextCookies()` last). The auth tables (`user`, `session`, `account`, `verification`, `passkey`, `rateLimit`) are in the frozen schema: do **not** change plugins in a way that needs new tables.
- `src/proxy.ts` (yours) only redirects on cookie presence. It is never the security check.
- `profileUpdateSchema` / `ProfileUpdate` / `ProfileRow` (`src/contracts/entities.ts`) and `profileToRow` (`src/server/mappers`).
- `src/server/sync-meta.ts` (`bumpSyncVersion`, `syncMixin`) for writing the first `BodyMetric` (a synced model) from the server.

<!-- sig: src/contracts/entities.ts#ProfileRow -->
```ts
// from src/contracts/entities.ts
export interface ProfileRow {
  sex: Sex | null;
  birthDate: LocalDateString | null;
  heightCm: number | null;
  unitPreference: WeightUnit;
  effortScale: EffortScale;
  experience: ExperienceLevel | null;
  goal: TrainingGoal | null;
  e1rmFormula: E1rmFormula;
  timezone: string;
  defaultRestSec: number;
  insightsEnabled: boolean;
  onboardedAt: IsoDateTime | null;
}
```

<!-- sig: src/server/auth/session.ts#SessionInfo,requireSessionInfo!,withUser! -->
```ts
// from src/server/auth/session.ts
export interface SessionInfo {
  ctx: UserCtx;
  user: SessionUser;
}

/** Like requireUser() but also returns the user's name/email/image (for the shell, avatar, settings). */
export async function requireSessionInfo(): Promise<SessionInfo>;

/** Wrap a server function so it always receives a verified ctx as its first argument. Throws UnauthorizedError when signed out. */
export function withUser<A extends unknown[], R>(fn: (ctx: UserCtx, ...args: A) => Promise<R>): (...args: A) => Promise<R>;
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

- **Email verification + password reset** through Resend (`RESEND_API_KEY`, `EMAIL_FROM`; see `.env.example`). Set `emailAndPassword.requireEmailVerification: true`, `sendOnSignUp`, `autoSignInAfterVerification`, and `sendResetPassword`. Templates + the Resend client live in `src/server/email/**` (plain, branded HTML + text). Pages: `(auth)/sign-in`, `sign-up`, `verify-email`, `forgot-password`, `reset-password`.
- **Mailbox for tests**: when `RESEND_API_KEY` is absent (dev/test) the email module stores messages in an in-memory outbox and logs them instead of sending; expose `GET /api/auth/test-mailbox?to=<email>` (inside `src/app/api/auth/**`) that returns them **only when `NODE_ENV !== "production"`** (404 otherwise). `e2e/helpers/mailbox.ts` reads it. Never send real email from tests.
- **Google sign-in** button (only rendered when Google is configured; read presence server-side, never expose the secret) and **passkeys**: register/list/rename/delete in `settings/security`; sign-in through browser autofill (`autocomplete="username webauthn"` + conditional UI via the passkey client plugin) plus an explicit "Sign in with a passkey" button. Lead with passkeys and email on iOS home-screen apps (separate cookie storage; Google redirect flows can be awkward in standalone mode).
- **Rate limits** for sign-in, sign-up, forgot-password and passkey endpoints via Better Auth `rateLimit.customRules` (storage already `database`). Show a friendly message on 429.
- **Onboarding wizard** at `(onboarding)/onboarding` (client wizard, final step a Server Action): sex (`MALE | FEMALE | PREFER_NOT_TO_SAY`; say it only drives formula coefficients and percentile comparisons and that prefer-not-to-say hides percentiles), birth date, height, weight unit, experience, goal, timezone (default `Intl.DateTimeFormat().resolvedOptions().timeZone`, validate with `isValidTimeZone`), first bodyweight and optional body fat. The action validates with `profileUpdateSchema`-style strict Zod schemas **with no `userId`**, writes `Profile` (upsert on `ctx.id`, set `onboardedAt`) and, inside the same transaction, the first `BodyMetric` using `bumpSyncVersion` + `syncMixin` (see CONTRACTS.md 12a) with `localDate` from the chosen timezone. Redirect to `/today`.
- `src/server/profile/guard.ts` exports `redirectIfNotOnboarded(ctx)` (redirects to `/onboarding` when `Profile.onboardedAt` is null). Wave 3 mounts it in the `(app)` layout; you only call it from your own pages and the sign-in success path.
- **Settings**: `settings/profile` (edit every Profile field; Server Actions; `unitPreference`, `effortScale`, `e1rmFormula`, `defaultRestSec`, `insightsEnabled`, `timezone`), `settings/security` (password change, passkeys, connected Google, active sessions with revoke), `settings/account` (**JSON export** of all of the user's data as a download from a route handler, built with the mappers so Decimals become numbers and there is no `userId`/secrets in it; **account deletion**: typed confirmation + recent-session/password check, then `prisma.user.delete` which cascades the whole domain graph, then sign out). A small `settings/page.tsx` + `layout.tsx` with sub-navigation (use daisyUI `tabs`/`menu`; stream B owns the app shell around it).
- Auth UI components in `src/components/auth/**` and `src/components/profile/**`; styles only in `src/styles/auth.css`. No stream-B components exist yet: use daisyUI classes (`btn`, `input`, `alert`, `tabs`) and the primitives. Inputs are at least 16px.
- **Security tests**: every profile/settings Server Action ignores or rejects an injected `userId` (the schemas are strict and have no such field; add a test that posts one and shows the action still only touches the session user's row).

**Notes.** Better Auth docs: https://better-auth.com/docs (Next.js integration, passkey plugin, email & password, rate limit). Server session access is `auth.api.getSession({ headers })`; never trust `proxy.ts`. Keep `nextCookies()` the last plugin. Keep `trustedOrigins` as is (it already allows `localhost:3000-3005` in development).

## Acceptance: run all of these before reporting done

1. `pnpm check` and `pnpm build` pass.
2. `pnpm ownership:check --stream=A` passes.
3. `pnpm test` includes unit tests for the schemas, the email module, the guard, and the account-export mapping (no Decimal, no `userId`, no tokens/password hashes).
4. `pnpm exec playwright test e2e/auth.spec.ts --project=chromium` (with `PORT=3001`, your Neon branch migrated): sign up -> verify via the mocked inbox -> onboarding -> `/today`; sign in; password reset through the mocked inbox; and the injected-`userId` test. Also run it once with `--project=webkit-iphone` if WebKit is installed (`pnpm exec playwright install webkit` is allowed).
5. `pnpm exec playwright test e2e/smoke.spec.ts` still passes **or** you replace its sign-up steps with the verification flow and report that (the smoke spec is frozen: file a change request instead of editing it).

## Do not touch

- Every frozen file in `CLAUDE.md` ("Frozen after Phase 0"): `package.json`, the lockfile, `prisma/schema.prisma`, `prisma/migrations/**`, `src/contracts/**`, `src/app/layout.tsx`, `src/server/auth/session.ts`, configs, `scripts/**`, `docs/**`, `ownership.json`.
- Any path owned by another stream (`ownership.json`). Other streams are working in parallel; a conflict costs the coordinator a merge.
- `src/app/(app)/layout.tsx` and the shell (stream B), `src/app/(app)/today/**` (Wave 3), `src/contracts/**`, the Prisma schema (no new auth tables: if a Better Auth feature needs one, file a change request).

## Change requests

If you need a frozen file or another stream's file changed, write `change-requests/A-<n>.md` with **What** (exact diff / new signature), **Why** (what it blocks), **Workaround** (what you do meanwhile), then keep working with the workaround. Do not edit the frozen file. List every change request in your report.

## Report format (your final message)

1. **Done**: what is implemented, per deliverable (and the commit range on your branch).
2. **Test output**: the actual tail of `pnpm check`, `pnpm build`, `pnpm ownership:check --stream=A` and your stream-specific commands. Say plainly what failed or was not run.
3. **Deviations** from this brief, with reasons.
4. **Change requests filed** (file names and one line each), or "none".
5. **PENDING** items (anything blocked on credentials or another stream).
