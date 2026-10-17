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

| Metric | Median | p75 | After B2 |
|---|---|---|---|
| Dock tap to heading, Today to Exercises | 733 ms | 798 ms | 103 ms (p75 117, first uncached tap 713) |
| Dock tap to heading, Exercises to Progress | 755 ms | 865 ms | 101 ms (p75 101, first uncached tap 654) |
| Dock tap to heading, Progress to Today | 966 ms | 982 ms | 102 ms (p75 103, first uncached tap 706) |
| Dock tap to heading, all 15 taps | 865 ms | 951 ms | 102 ms (p75 110, max 713) |
| Dock tap to network idle, Exercises / Progress / Today | 733 / 755 / 966 ms | 798 / 865 / 982 ms | 103 / 101 / 102 ms (max 1037 / 1123 / 706) |
| Dial, 10-detent drag: pointerdown to readout settled | 799 ms | 801 ms | 795 ms (p75 807) |
| Dial: readout lag after the last pointer move | 17 ms | 17 ms | 13 ms (p75 14) |
| Dial: long tasks over 50 ms during the drag | 0 | 0 | 0 |
| Picker, 'bench press': key to results updated (30 of 55 keys change the DOM) | 33 ms | 36 ms | 32 ms (p75 33) |
| Picker: key to next paint (Event Timing) | 24 ms | 25 ms | 17 ms (p75 24) |
| Picker: 11 keystrokes, summed update time | 197 ms | 199 ms | 183 ms (p75 188) |
| Picker: long tasks over 50 ms | 0 | 0 | 0 |
| INP after the interactions (dial / picker / navigation) | 48 / 48 / 8 ms | n/a | 48 / 48 / 8 ms |
| `/today` browser TTFB (unthrottled) | 1707 ms | 1764 ms | 132 ms (p75 189) |
| `/today` server total (proxy to end of response) | 842 ms | 911 ms | 564 ms (p75 705) |
| `/today` Prisma queries, summed query time, DB wall time | 18, 2045 ms, 825 ms | 18, 2405 ms, 891 ms | 9, 1164 ms, 547 ms (p75 9, 1558, 685) |
| `/progress` browser TTFB | 889 ms | 1048 ms | 71 ms (p75 74) |
| `/progress` server total | 884 ms | 1043 ms | 481 ms (p75 538) |
| `/progress` Prisma queries, summed query time, DB wall time | 11, 1472 ms, 862 ms | 11, 1481 ms, 1022 ms | 5, 656 ms, 452 ms (p75 5, 724, 513) |
| `/exercises` browser TTFB | 753 ms | 776 ms | 322 ms (p75 493) |
| `/exercises` server total | 750 ms | 766 ms | 320 ms (p75 486) |
| `/exercises` Prisma queries, summed query time, DB wall time | 8, 1042 ms, 727 ms | 8, 1128 ms, 752 ms | 4, 409 ms, 302 ms (p75 4, 558, 455) |
| Dock tap to skeleton visible (new metric; only taps that showed one) | n/a | n/a | 89 ms (p75 93); 2 of 15 taps |
| Dock tap to first feedback, skeleton else heading (new metric) | n/a | n/a | 101 ms (p75 102, max 713) |

Lighthouse (mobile, simulated slow 4G / 4x CPU, `tools/lighthouse/run.ts`), one run, performance score:

| Page | Perf | LCP | TBT | CLS | A11y | Best practices | After B2 |
|---|---|---|---|---|---|---|---|
| landing | 95 | 3005 ms | 36 ms | 0 | 100 | 100 | 92, LCP 3378 ms, TBT 30 ms, CLS 0 |
| sign-in | 91 | 3457 ms | 20 ms | 0 | 100 | 100 | 91, LCP 3456 ms, TBT 22 ms, CLS 0 |
| today | 81 | 3909 ms | 97 ms | 0.144 | 100 | 100 | 84, LCP 4522 ms, TBT 81 ms, CLS 0.001 |
| progress series | 80 | 4210 ms | 277 ms | 0 | 100 | 100 | 76, LCP 4841 ms, TBT 291 ms, CLS 0 |
| workout | 85 | 4371 ms | 62 ms | 0 | 100 | 100 | 85, LCP 4380 ms, TBT 69 ms, CLS 0 |
| exercises | 87 | 4060 ms | 62 ms | 0 | 100 | 100 | 88, LCP 3836 ms, TBT 39 ms, CLS 0 |

### Reading the numbers

- **Query counts are the clearest finding.** `/today` runs 18 Prisma queries per request, `/progress` 11, `/exercises` 8. The sum of query durations (2.0 s for `/today`) is more than twice the DB wall time (0.8 s) and about the same as the whole server time, so queries overlap but a long chain remains. Server time is dominated by database round trips.
- `/today` browser TTFB (1.7 s) is about twice the server total (0.8 s) ; the extra second was not broken down (first request on a fresh context, possibly connection set-up), so treat it as unexplained. The in-app dock taps (RSC navigation) are about 0.75 to 1.0 s.
- The dial and the picker did **not** produce long tasks on this machine at 4x CPU. The dial readout trails the finger by one frame (about 17 ms). Typing is about 24 ms to paint. These two are healthy on a production build; the earlier report of lag may be dev-build or lower-end device specific, and is worth confirming on a real phone.
- Lighthouse variance is large on the signed-in pages. The `/workout` score was 75 (LCP 10.8 s) on a first run taken while the demo user still had an active workout left over from the harness, and 85 once the account was clean. The `/workout` budget in `tools/lighthouse/run.ts` is 0.70 (same as progress) for now; the target is 0.80.
- `/today` CLS is 0.144, above the 0.1 "good" threshold.

### After B2 (measured 2026-10-16 after the B-VERIFY fixes; same setup, port 3002, `OVERLOAD_SERVER_TIMING=1` at build and runtime)

- **Query counts roughly halved.** `/today` 18 to 9, `/progress` 11 to 5, `/exercises` 8 to 4, from one cached session and profile read per request plus the Better Auth cookie cache. Summed query time and DB wall time fell with them, and server total with those: `/today` 842 to 564 ms, `/progress` 884 to 481 ms, `/exercises` 750 to 320 ms.
- **Browser TTFB fell much more than server time** (`/today` 1707 to 132 ms, `/progress` 889 to 71 ms). Do not read all of that as a win: the baseline's TTFB included the unexplained first-request cost and this run hit warm connections. Server total is the comparable number.
- **Dock taps are about 100 ms at the median, but that is mostly the router cache.** `staleTimes.dynamic: 30` serves a revisited page from the client, and the spec taps the same three pages five times. The first, uncached tap of each is the comparable figure: 713 ms (Exercises), 654 ms (Progress), 706 ms (Today), against 733 / 755 / 966 ms before. A modest gain (3 to 27 percent): a cold tap still waits for the throttled link and one server render.
- **Tap to skeleton** (new): 89 ms median, but only 2 of 15 taps showed one. Cached taps render at once, and `/exercises` and `/progress/<id>` deliberately have no loading boundary (the dock item's `LinkPending` indicator is the feedback). `/today` and the index pages of `/progress`, `/history`, `/templates` and `/insights` keep a skeleton.
- **Dial and picker are unchanged** (within noise); B2 did not touch them. Both still show 0 long tasks.
- **Lighthouse is flat within the 10 to 15 percent run-to-run noise**: today +3, exercises +1, landing -3, progress series -4 (TBT 291 ms, its charts load client-side), workout and sign-in unchanged. Under simulated slow 4G a 4 s LCP is dominated by JS and font transfer, so a 200 to 400 ms server saving barely shows. Today's CLS fell from 0.144 to 0.001. The LCP rises on today (+613 ms) and progress series (+631 ms) are not explained by this change; treat them as noise unless a repeat run shows them again.
- **Why some routes have no skeleton:** a `loading.tsx` above a page that can call `notFound()` makes Next stream a 200 before the page runs, and streamed content needs JavaScript to replace its fallback. So `/exercises`, `/exercises/[id]`, `/progress/[exerciseId]` and `/insights/[week]` have no loading boundary, and each section's index page sits in an `(index)` route group so its `loading.tsx` does not wrap the detail routes.

### After C1 (PERF-2, workout responsiveness; measured 2026-10-16, port 3002, production build, `OVERLOAD_SERVER_TIMING=1`)

The "Before" column is the code before C1 (`design/calibrated-dial` at `369b1eb` plus the harness counters), built and measured in the same session; "After" is this branch. Medians of 5 repetitions, same throttling as above. The harness gained IndexedDB transaction counts, DOM mutation batches (about one per React commit), style recalculations, layouts and script time for the 10-detent dial drag (`e2e/perf/dial.spec.ts`).

| Metric (10-detent dial drag unless noted) | Before | After C1 |
|---|---|---|
| pointerdown to readout settled | 823 ms (p75 826) | 827 ms (p75 830) |
| Readout lag after the last pointer move | 18 ms (p75 19) | 1 ms (p75 1) |
| Long tasks over 50 ms | 0 | 0 |
| IndexedDB read-write transactions (writes) | 10 | 2 (p75 3; one is the set write) |
| IndexedDB read-only transactions (reads) | 90 | 12 (p75 21, max 29) |
| DOM mutation batches under `.wk-active` (about one per commit) | 24 | 17 |
| DOM mutation records under `.wk-active` | 227 | 179 |
| Script time in the page | 117 ms | 57 ms |
| Style recalculations / layouts | 54 / 53 | 60 / 51 (within noise) |
| Picker: key to results updated | 34 ms (p75 35) | 34 ms (p75 37) |
| Picker: key to next paint | 24 ms | 24 ms |
| Picker: 11 keystrokes, summed update time | 197 ms | 194 ms |
| Picker: long tasks over 50 ms | 0 | 0 |

Render counts for the active workout screen (DOM test `src/components/workout/active-workout-renders.dom.test.tsx`, two exercises, real repo on fake-indexeddb; it fails on the code before C1 and passes now):

| Event | Before | After C1 |
|---|---|---|
| Elapsed clock, 2.3 s | each exercise block re-rendered 2 times | 0 |
| Rest countdown, 1.3 s | each exercise block re-rendered 8 times | 0 |
| One reps change in exercise A | exercise B re-rendered; the history reads (`lastTime`, `forSeries`) ran again | B not re-rendered; no history read |

- **What changed on the wire:** a 10-detent drag now writes once (on release) instead of ten times, and each write re-reads one query (the workout's sets) instead of the whole workout view plus the record history. That is the 90 to 12 drop in reads. The readout trails the finger by one frame less (18 to 1 ms) because it comes from local state, not from the database round trip.
- **What did not change, and why:** "pointerdown to readout settled" is dominated by the scripted drag itself (24 touch moves 16 ms apart), so it cannot show a gain. The harness machine at 4x CPU throttle never had long tasks on the dial or the picker, so the user-visible win on a real phone is in the work saved per detent (script time halved), not in a long-task count. The picker was not touched.
- **Remaining commits during a drag (17 batches for 10 detents):** one per detent for the live readout, the picture and the dial itself, plus the dial's own bump and tween state. They are small now (the panel re-renders; the exercise blocks, set rows, reps strip and effort buttons do not).
- **Not measured:** a real phone. The Lighthouse score was not re-run (this part changes no route's bundle size or server work).

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
