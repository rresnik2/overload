# Deploying Overload (Vercel + Neon)

The app is live at https://overloadfit.vercel.app. This is the reference for how it is configured and what to check on a new project or a new environment. Nothing here is run by agents: deployments, Vercel linking and anything that needs a credential are the owner's.

## 1. Environment variables

Source of truth: `.env.example` (every variable, with where to get it) and `src/server/env.ts` (what the server validates). Set these in Vercel > Project > Settings > Environment Variables (Production and Preview unless noted). Never commit `.env.local`.

| Variable | Where it comes from | Production |
|---|---|---|
| `DATABASE_URL` | Neon > Connect > **pooled** string (host contains `-pooler`) | **required** (runtime) |
| `DIRECT_URL` | Neon > Connect > **direct** (unpooled) string | **required** for `prisma migrate deploy`; unused at runtime |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`; keep it stable (rotating signs everyone out) | **required** (16+ characters) |
| `BETTER_AUTH_URL` | the public origin, `https://overloadfit.vercel.app` | recommended. On Vercel `resolveAppUrl()` (`src/lib/app-url.ts`) ignores a localhost value and falls back to the production domain, so a copied `.env.local` cannot send OAuth callbacks to localhost |
| `NEXT_PUBLIC_APP_URL` | same value as `BETTER_AUTH_URL` | recommended |
| `PASSKEY_RP_ID` | the registrable domain, `overloadfit.vercel.app` (leave empty to derive it from the app URL) | optional. Changing it later orphans every registered passkey |
| `PASSKEY_RP_NAME` | display name, default `Overload` | optional |
| `RESEND_API_KEY` | resend.com > API Keys | **required**: sign-up needs a verification email and password reset sends one |
| `EMAIL_FROM` | `"Overload <you@your-verified-domain>"`. `onboarding@resend.dev` only delivers to the Resend account owner | **required** with a verified domain before inviting other users |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud > Credentials > OAuth client (Web). Redirect URI: `https://overloadfit.vercel.app/api/auth/callback/google` | optional: the Google button only renders when both are set |
| `ANTHROPIC_API_KEY` | console.anthropic.com | needed for the written weekly narrative. Without it the insight cards still render from the rules and the narrative step is skipped |
| `INSIGHTS_MODEL` | model for the narrative, default `claude-opus-5-5` | optional |
| `CRON_SECRET` | `openssl rand -hex 32` (16+ characters). Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` | **required**: both cron routes answer 401 without it |
| `DATABASE_POOL_MAX` | max pooled connections per instance, default 10 | optional |

Not for production (set them nowhere on Vercel):

- `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_PARENT_BRANCH`, `NEON_DATABASE_NAME`, `NEON_ROLE_NAME`: only `pnpm db:branch` (per-worktree Neon branches) reads them.
- `SHADOW_DATABASE_URL`: only `pnpm db:diff`.
- `INSIGHTS_LIVE` (opt-in live Anthropic test) and `INSIGHTS_E2E_FAKE` (swaps the model for an offline stand-in: **never in production**, it would write fake narratives).
- `E2E_BASE_URL`, `PORT`: test and local-dev only.
- `DEMO_PASSWORD`: the demo-user seed refuses to run when `VERCEL_ENV=production`; never seed `demo@overload.test` into the production database.

## 2. Vercel project settings

- **Framework** Next.js; **install** `pnpm install --frozen-lockfile`; **build** `pnpm build` (these come from `vercel.json`). The build script is `prisma generate && next build` because Vercel's build cache skips `postinstall`. Node 24, `packageManager` pinned in `package.json`.
- **Region**: set Functions > Region to the one closest to the Neon project's region (Neon > Project > Settings shows it, e.g. `aws-us-east-1` pairs with Vercel `iad1`). A mismatch adds a transatlantic round trip to every query (the signed-in pages are the slowest in `tools/lighthouse/run.ts` for exactly this reason). The sync route (`maxDuration = 30`) and the insights page and cron (`maxDuration = 60`) fit the Hobby limit.
- **Crons** (declared in `vercel.json`, no dashboard setup needed; check Settings > Cron Jobs after the first deploy):
  - `/api/cron/insights` daily at 12:00 UTC: writes each user's weekly review (skips users whose local week is not ready, stops before the function limit).
  - `/api/sync/gc` daily at 04:00 UTC: hard-deletes tombstones older than 90 days.
  Both need `CRON_SECRET` in the project's environment, or they return 401 and nothing runs.
- **Domains**: `overloadfit.vercel.app` (production). If a custom domain is added, update `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, the Google redirect URI and `PASSKEY_RP_ID` together.
- **Protection**: Preview deployments are behind Vercel Authentication by default; leave it on. Production is public.

## 3. Neon (main branch)

Run from a machine whose `.env.local` points at the **production** database (or pass the variables inline). Never run `prisma migrate dev`, and never `prisma@latest` (the repo is on Prisma 7).

```bash
pnpm db:deploy   # prisma migrate deploy: applies pending migrations (uses DIRECT_URL)
pnpm db:seed     # upserts the exercise catalog (876 exercises) and bumps the catalog version
```

Both are idempotent. Re-run `pnpm db:seed` after a catalog change; clients re-download the catalog when its version changes (`/api/catalog` ETag).

Worktrees and e2e use their own Neon branches (`pnpm db:branch <name>`), never the main branch: `playwright.config.ts` refuses to run in the main checkout for that reason.

## 4. Release checklist

1. `pnpm check`, `pnpm build`, `pnpm test:integration` (on a Neon branch) are green.
2. `E2E_PROD=1 pnpm test:e2e` on chromium and webkit-iphone is green (production build, so the service worker and offline specs run).
3. `pnpm exec tsx tools/lighthouse/run.ts` against a production build meets the budgets (see `tools/lighthouse/run.ts`).
4. Merge to `main`; Vercel builds and deploys. Apply any new migration with `pnpm db:deploy` **before** the new code takes traffic (migrations are additive, so the old code keeps working against the new schema).
5. Smoke test production: sign up with a real address (verification email arrives), sign in, `/today`, log a set, `/api/health` answers `{"ok":true}`.

## 5. PENDING for the owner

These need your accounts or your hands; none of them is done:

- Verify a sending domain in Resend and set `EMAIL_FROM` to it (until then only your own address receives mail).
- Confirm the Vercel function region matches the Neon region (Vercel > Settings > Functions, Neon > Settings).
- Confirm `CRON_SECRET`, `ANTHROPIC_API_KEY` and `BETTER_AUTH_SECRET` are set in the Production environment and that both crons appear under Settings > Cron Jobs.
- Add the Google OAuth redirect URI `https://overloadfit.vercel.app/api/auth/callback/google` if Google sign-in should work in production, then try it once.
- Run the iPhone checklist from `docs/PLAN.md` ("Verification > iPhone") on a real device: Add to Home Screen, standalone launch, safe areas, dock above the home indicator, offline logging in airplane mode, passkey sign-in in standalone mode. The Playwright suite proves the WebKit engine, not the installed app.
- Visual baselines in `e2e/budgets/visual.spec.ts-snapshots/` are macOS renders; run `pnpm exec playwright test e2e/budgets/visual.spec.ts --project=chromium --update-snapshots` once in CI (Linux) and commit them if the visual job should run there.
