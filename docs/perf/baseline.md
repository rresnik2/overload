# Performance baseline (PERF-0)

Measured before any performance change, so later parts can show before and after. Fill the **After** column as each part lands and re-run with the same setup.

## Environment

- Date 2026-10-16. MacBook (Apple M2, macOS 26.6.2), Node 24.15, Next 16 **production build** (`pnpm build`, `pnpm start -p 3004`), Chromium via Playwright.
- Database: the shared Neon dev branch in `us-east-2`, reached over the public internet from the laptop. Every query pays a real round trip (a few tens of ms), so server numbers here are **worse than Vercel (same region as Neon)** and better than a cold serverless function. Treat server time as a relative number, not a production prediction.
- Served from `localhost` over plain http. There is no TLS or HTTP/2 cost, no CDN and no compression from an edge. A LAN device on plain http would be similar; production differs.
- Harness client: Playwright `devices["Pixel 7"]`, CDP CPU throttling 4x, CDP network 1.6 Mbps down / 750 kbps up / 150 ms RTT (set per spec by `throttle()` in `e2e/perf/support.ts`). The server-time spec does not throttle the browser.
- User: the demo user (`demo@overload.test`, 16 weeks of history from `prisma/seed/fixtures.ts`).
- 5 repetitions per measurement (`PERF_REPS`), median and p75 reported. One Playwright worker.
- Conditions: the harness and Lighthouse ran in one locked command, so no other build or e2e run overlapped. Other agents may have been running light work (typecheck, unit tests) on the same Mac at the time. Expect run-to-run noise of roughly 10 to 15 percent; two full runs differed by that much.

## Baseline

| Metric | Median | p75 | After |
|---|---|---|---|
| Dock tap to heading, Today to Exercises | 733 ms | 798 ms | |
| Dock tap to heading, Exercises to Progress | 755 ms | 865 ms | |
| Dock tap to heading, Progress to Today | 966 ms | 982 ms | |
| Dock tap to heading, all 15 taps | 865 ms | 951 ms | |
| Dock tap to network idle, Exercises / Progress / Today | 733 / 755 / 966 ms | 798 / 865 / 982 ms | |
| Dial, 10-detent drag: pointerdown to readout settled | 799 ms | 801 ms | |
| Dial: readout lag after the last pointer move | 17 ms | 17 ms | |
| Dial: long tasks over 50 ms during the drag | 0 | 0 | |
| Picker, 'bench press': key to results updated (30 of 55 keys change the DOM) | 33 ms | 36 ms | |
| Picker: key to next paint (Event Timing) | 24 ms | 25 ms | |
| Picker: 11 keystrokes, summed update time | 197 ms | 199 ms | |
| Picker: long tasks over 50 ms | 0 | 0 | |
| INP after the interactions (dial / picker / navigation) | 48 / 48 / 8 ms | n/a | |
| `/today` browser TTFB (unthrottled) | 1707 ms | 1764 ms | |
| `/today` server total (proxy to end of response) | 842 ms | 911 ms | |
| `/today` Prisma queries, summed query time, DB wall time | 18, 2045 ms, 825 ms | 18, 2405 ms, 891 ms | |
| `/progress` browser TTFB | 889 ms | 1048 ms | |
| `/progress` server total | 884 ms | 1043 ms | |
| `/progress` Prisma queries, summed query time, DB wall time | 11, 1472 ms, 862 ms | 11, 1481 ms, 1022 ms | |
| `/exercises` browser TTFB | 753 ms | 776 ms | |
| `/exercises` server total | 750 ms | 766 ms | |
| `/exercises` Prisma queries, summed query time, DB wall time | 8, 1042 ms, 727 ms | 8, 1128 ms, 752 ms | |

Lighthouse (mobile, simulated slow 4G / 4x CPU, `tools/lighthouse/run.ts`), one run, performance score:

| Page | Perf | LCP | TBT | CLS | A11y | Best practices | After |
|---|---|---|---|---|---|---|---|
| landing | 95 | 3005 ms | 36 ms | 0 | 100 | 100 | |
| sign-in | 91 | 3457 ms | 20 ms | 0 | 100 | 100 | |
| today | 81 | 3909 ms | 97 ms | 0.144 | 100 | 100 | |
| progress series | 80 | 4210 ms | 277 ms | 0 | 100 | 100 | |
| workout | 85 | 4371 ms | 62 ms | 0 | 100 | 100 | |
| exercises | 87 | 4060 ms | 62 ms | 0 | 100 | 100 | |

### Reading the numbers

- **Query counts are the clearest finding.** `/today` runs 18 Prisma queries per request, `/progress` 11, `/exercises` 8. The sum of query durations (2.0 s for `/today`) is more than twice the DB wall time (0.8 s) and about the same as the whole server time, so queries overlap but a long chain remains. Server time is dominated by database round trips.
- `/today` browser TTFB (1.7 s) is about twice the server total (0.8 s) ; the extra second was not broken down (first request on a fresh context, possibly connection set-up), so treat it as unexplained. The in-app dock taps (RSC navigation) are about 0.75 to 1.0 s.
- The dial and the picker did **not** produce long tasks on this machine at 4x CPU. The dial readout trails the finger by one frame (about 17 ms). Typing is about 24 ms to paint. These two are healthy on a production build; the earlier report of lag may be dev-build or lower-end device specific, and is worth confirming on a real phone.
- Lighthouse variance is large on the signed-in pages. The `/workout` score was 75 (LCP 10.8 s) on a first run taken while the demo user still had an active workout left over from the harness, and 85 once the account was clean. The `/workout` budget in `tools/lighthouse/run.ts` is 0.70 (same as progress) for now; the target is 0.80.
- `/today` CLS is 0.144, above the 0.1 "good" threshold.

### Not measured, and why

- **Server time for client-side (RSC) navigations.** The probe lives in the root layout, which React does not re-render on a dock tap, so only full document loads produce entries. The navigation spec prints `n/a` for these rows. The browser-side tap-to-heading time includes the server cost.
- **The `/exercises` hang is not reproduced.** An earlier session saw `/exercises` hang for 914 s (`ERR_ABORTED`) after Neon `P1017 ConnectionClosed` errors on a server that had been up since 5am while the Mac slept, which points at stale pooled connections. On a fresh server (this run, no sleep) `/exercises` loaded every time, with a maximum of about 1 s. No navigation timeout or retry was added to the harness, so a hang would show as a failed spec. This belongs to the Wave B pool work (idle/keep-alive and `max` on the pool in `src/server/db.ts`); nothing about pool behaviour was changed here.
- Real device, real network and Vercel-to-Neon latency were not measured.

## How to rerun

```
pnpm build
OVERLOAD_SERVER_TIMING=1 BETTER_AUTH_URL=http://localhost:3004 NEXT_PUBLIC_APP_URL=http://localhost:3004 pnpm start -p 3004 &
PERF=1 E2E_PROD=1 PORT=3004 OVERLOAD_SERVER_TIMING=1 pnpm exec playwright test --project=perf
PORT=3004 pnpm exec tsx tools/lighthouse/run.ts
```

- The `perf` project exists only when `PERF=1`; the default `pnpm test:e2e` lists only `chromium` and `webkit-iphone`.
- Env: `.env.local` needs a database with the demo user seeded (`pnpm exec tsx prisma/seed/fixtures.ts`). `PERF_REPS=<n>` changes the repetitions.
- Results: `test-results/perf/{navigation,dial,picker,server}.json` (raw samples included), plus a summary table on stdout.
- Do not run it while other builds or e2e runs are active; they distort the timings. Always use the production build.
- Web vitals: `window.__overloadVitals` is filled when `localStorage["overload:vitals"] = "1"` or the URL has `?vitals=1` (`src/app/web-vitals.tsx`). Silent otherwise.
- Server timing: with `OVERLOAD_SERVER_TIMING=1` the server logs `[server-timing] html /today db;dur=…;desc="N queries"` per full page request, and `/api/perf/server-timing` serves the recent entries (GET, DELETE to reset). Queries are attributed to a request through an `x-overload-id` header set by `proxy.ts` and a Prisma client extension in `db.ts`. With the flag off nothing is installed.
- The harness leaves the demo user with no active workout (the specs discard theirs).
