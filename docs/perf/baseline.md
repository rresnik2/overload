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

| Metric | Median | p75 | After B2 | After C2 |
|---|---|---|---|---|
| Dock tap to heading, Today to Exercises | 733 ms | 798 ms | 103 ms (p75 117, first uncached tap 713) | 134 ms (p75 135, first tap after load 229) |
| Dock tap to heading, Exercises to Progress | 755 ms | 865 ms | 101 ms (p75 101, first uncached tap 654) | 116 ms (p75 118, first 134) |
| Dock tap to heading, Progress to Today | 966 ms | 982 ms | 102 ms (p75 103, first uncached tap 706) | 102 ms (p75 103, first 104) |
| Dock tap to heading, all 15 taps | 865 ms | 951 ms | 102 ms (p75 110, max 713) | 104 ms (p75 126, max 229) |
| Dock tap to network idle, Exercises / Progress / Today | 733 / 755 / 966 ms | 798 / 865 / 982 ms | 103 / 101 / 102 ms (max 1037 / 1123 / 706) | 134 / 116 / 102 ms (max 1160 / 134 / 104) |
| Dial, 10-detent drag: pointerdown to readout settled | 799 ms | 801 ms | 795 ms (p75 807) | 819 ms (p75 831) |
| Dial: readout lag after the last pointer move | 17 ms | 17 ms | 13 ms (p75 14) | 18 ms (p75 18) |
| Dial: long tasks over 50 ms during the drag | 0 | 0 | 0 | 0 |
| Picker, 'bench press': key to results updated (30 of 55 keys change the DOM) | 33 ms | 36 ms | 32 ms (p75 33) | 31 ms (p75 38) |
| Picker: key to next paint (Event Timing) | 24 ms | 25 ms | 17 ms (p75 24) | 18 ms (p75 24) |
| Picker: 11 keystrokes, summed update time | 197 ms | 199 ms | 183 ms (p75 188) | 193 ms (p75 193) |
| Picker: long tasks over 50 ms | 0 | 0 | 0 | 0 |
| INP after the interactions (dial / picker / navigation) | 48 / 48 / 8 ms | n/a | 48 / 48 / 8 ms | 40 / 64 / 8 ms |
| `/today` browser TTFB (unthrottled) | 1707 ms | 1764 ms | 132 ms (p75 189) | 74 ms (p75 122) |
| `/today` server total (proxy to end of response) | 842 ms | 911 ms | 564 ms (p75 705) | 601 ms (p75 630) |
| `/today` Prisma queries, summed query time, DB wall time | 18, 2045 ms, 825 ms | 18, 2405 ms, 891 ms | 9, 1164 ms, 547 ms (p75 9, 1558, 685) | 9, 1373 ms, 583 ms |
| `/progress` browser TTFB | 889 ms | 1048 ms | 71 ms (p75 74) | 62 ms (p75 66) |
| `/progress` server total | 884 ms | 1043 ms | 481 ms (p75 538) | 451 ms (p75 506) |
| `/progress` Prisma queries, summed query time, DB wall time | 11, 1472 ms, 862 ms | 11, 1481 ms, 1022 ms | 5, 656 ms, 452 ms (p75 5, 724, 513) | 5, 571 ms, 430 ms |
| `/exercises` browser TTFB | 753 ms | 776 ms | 322 ms (p75 493) | 339 ms (p75 344) |
| `/exercises` server total | 750 ms | 766 ms | 320 ms (p75 486) | 339 ms (p75 344) |
| `/exercises` Prisma queries, summed query time, DB wall time | 8, 1042 ms, 727 ms | 8, 1128 ms, 752 ms | 4, 409 ms, 302 ms (p75 4, 558, 455) | 4, 444 ms, 314 ms |
| Dock tap to skeleton visible (new metric; only taps that showed one) | n/a | n/a | 89 ms (p75 93); 2 of 15 taps | none (0 of 15 taps showed one: every tap was already prefetched) |
| Dock tap to first feedback, skeleton else heading (new metric) | n/a | n/a | 101 ms (p75 102, max 713) | 104 ms (p75 126, max 229) |

Lighthouse (mobile, simulated slow 4G / 4x CPU, `tools/lighthouse/run.ts`), one run, performance score:

| Page | Perf | LCP | TBT | CLS | A11y | Best practices | After B2 | After C2 |
|---|---|---|---|---|---|---|---|---|
| landing | 95 | 3005 ms | 36 ms | 0 | 100 | 100 | 92, LCP 3378 ms, TBT 30 ms, CLS 0 | 94, LCP 3155 ms, TBT 32 ms, CLS 0 |
| sign-in | 91 | 3457 ms | 20 ms | 0 | 100 | 100 | 91, LCP 3456 ms, TBT 22 ms, CLS 0 | 91, LCP 3455 ms, TBT 21 ms, CLS 0 |
| today | 81 | 3909 ms | 97 ms | 0.144 | 100 | 100 | 84, LCP 4522 ms, TBT 81 ms, CLS 0.001 | 84, LCP 4526 ms, TBT 63 ms, CLS 0.001 |
| progress series | 80 | 4210 ms | 277 ms | 0 | 100 | 100 | 76, LCP 4841 ms, TBT 291 ms, CLS 0 | 74, LCP 5421 ms, TBT 261 ms, CLS 0 |
| workout | 85 | 4371 ms | 62 ms | 0 | 100 | 100 | 85, LCP 4380 ms, TBT 69 ms, CLS 0 | 84, LCP 4526 ms, TBT 58 ms, CLS 0 |
| exercises | 87 | 4060 ms | 62 ms | 0 | 100 | 100 | 88, LCP 3836 ms, TBT 39 ms, CLS 0 | 83, LCP 4671 ms, TBT 33 ms, CLS 0 |

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

### After C2 (PERF-3; measured 2026-10-16, production build on port 3003, `OVERLOAD_SERVER_TIMING=1` at build and runtime, one locked run; dial, prefetch and navigation were re-run on the final build)

**Requests while logging (the owner's main ask).** `e2e/perf/sync-count.spec.ts`: a Pixel 7 profile signs in as the demo user, starts a workout, logs 10 sets by the phone panel (typing the weight, picking reps, Log set) with a pause between sets, then discards the workout. It counts what the page POSTs to `/api/sync`, GETs from `/api/catalog`, and fetches as RSC.

| | Before (After B2 code) | After C2 |
|---|---|---|
| `POST /api/sync` while logging 10 sets, 3 s apart (33 s) | 11 | **0** |
| `POST /api/sync` while logging 10 sets, 36 s apart (362 s, longer than 5 minutes) | 11 | **1** (the 5-minute tick) |
| `POST /api/sync` in the 6 s after Discard | 1 | 1 (immediate, by design) |
| `/api/catalog`, RSC fetches while logging | 0, 0 | 0, 0 |

Before, every logged set (several outbox writes each) was pushed 1.5 s later. After, a workout sends at most one sync per 5 minutes while changes are pending, plus the one at the end (Finish or Discard) and whatever the "Sync now" button sends. A 45-minute workout is therefore bounded by about 10 syncs, against one per set before. A sync with nothing to push is also cheaper on the server now (no write transaction, no row lock, no PR rebuild).

**JavaScript, CSS and fonts per route** (`e2e/perf/bundle.spec.ts`: cold load as the demo user with the service worker blocked, decoded bytes; Next 16 prints no size table). The "before load" and "after" split is bytes that arrived before and after the window `load` event.

| Route | Before (After B2 code) | After C2 total | After C2 before load | After C2 later |
|---|---|---|---|---|
| `/sign-in` | 561 KB | 561 KB | 561 KB | 0 |
| `/today` | 856 KB | 861 KB | 861 KB | 0 |
| `/exercises` | 852 KB | 859 KB | 808 KB | 51 KB |
| `/progress` | 836 KB | 841 KB | 841 KB | 0 |
| `/progress/<exercise>` | 1247 KB | 1278 KB | **795 KB** | **483 KB** (recharts and the three charts) |
| `/history` | 855 KB | 861 KB | 810 KB | 51 KB |
| `/workout` | 1039 KB | 1027 KB | 919 KB | 108 KB |
| `/settings/profile` | 846 KB | 850 KB | 850 KB | 0 |

- Render-blocking CSS: **222 KB to 219 KB** raw (2 stylesheets, about 36 KB on the wire). The `@source not` exclusions saved only 3 KB: the plan's guess that Tailwind scanning `prisma/data` and `docs/` bloated the stylesheet was wrong; the 219 KB is daisyUI plus the partials.
- Fonts are unchanged at 187 KB (two Archivo files, upright and italic). Preloading only the upright face was **skipped**: the italic is the display face on every first screen (headings, numerals), so deferring it would trade 94 KB for a font swap that moves headings.
- Total JS grew by 4 to 10 KB per route (the sync policy, the manual sync control, the prefetch hook, the pointer code). The progress detail page now defers 483 KB until after hydration; the chart area is a placeholder of the exact plot size, so nothing moves.
- Some routes show 51 to 108 KB "later": chunks of the neighbouring tabs that the dock's full prefetch pulls in once the page is idle (see below), and the lazy exercise sheets.

**Tab prefetch** (`e2e/perf/prefetch.spec.ts`, throttled Pixel 7, first dock tap after loading `/today`):

| | Median | p75 |
|---|---|---|
| Before: `router.prefetch()` for the neighbours, tap 0.3 s after load | 548 ms | 584 ms |
| Before: same, tap 5 s after load | 550 ms | 564 ms |
| After: dock `Link prefetch={true}` once idle, tap 0.3 s after load | **134 ms** | 134 ms |
| After: same, tap 5 s after load | **132 ms** | 133 ms |

The first attempt, `router.prefetch()`, did nothing for the tap: in Next 16.4 it is only the partial "auto" prefetch, and `/exercises` has no `loading.tsx`. A `<Link prefetch>` is the full prefetch, and the dock now sets it for the neighbouring tabs after the page has been idle (not on data saver or 2G, not during a workout). In the navigation spec the first, uncached tap of each page fell from 713, 654 and 706 ms (After B2) to 229, 134 and 104 ms (Exercises, Progress, Today). The price: each visit to a tab renders its neighbours on the server (`/exercises` from `/today`; `/today` and `/progress` from `/exercises`), cached for 30 s by `staleTimes.static` and refreshed after a sync like any other page. That is the trade the owner asked for; it is off during a workout.

**Exercise photos** (`/exercises` shows 48 cards per page): the 70 KB JPEG originals are now served through the Next image optimizer as WebP: one photo is 72.8 KB original, 13 KB at 384 px, 25 KB at 640 px, 35 KB at 828 px (a 3x phone asks for 828). The first request of a size pays the server resize (about 0.1 to 0.2 s); later ones are cached. Lighthouse for `/exercises` fell from 88 to 83 (LCP 3836 to 4671 ms): its single cold load pays that first resize for the LCP photo, which a real visit does once per photo and size. Custom exercises with their own image URL stay unoptimized.

**Other numbers.** The dial and the picker are unchanged within noise (0 long tasks; the picker's key to results is 31 ms, with the exercise list now kept in memory between keystrokes and the render deferred). Query counts per page are unchanged (9, 5, 4); the `/exercises` request now reads only the user's own exercises, favorites and the page's rows instead of all ~900 exercises with their muscles, which shows in database load rather than in this laptop-to-Neon latency (server total 339 ms against 320 ms is inside the noise). Lighthouse moved within its 10 to 15 percent noise: landing +2, sign-in 0, today 0, workout -1, progress series -2 (TBT 291 to 261 ms, but LCP 4841 to 5421 ms: the chart now arrives after hydration, one more request in the waterfall), exercises -5 (explained above). One caveat on this run: an unrelated database test run overlapped the first dial attempt on the shared Neon branch, and the dial spec then failed to load the catalog; it passed on the final build with the numbers above.

### After D1 (DIAL part D1: server refresh, LCP; measured 2026-10-16, production build on port 3002, `OVERLOAD_SERVER_TIMING=1`, one locked run per set, 3 Lighthouse runs per page)

**Server-page refresh after a sync.** `router.refresh()` is one whole server render (about 9 queries on `/today`). It used to run after every sync that pushed or pulled anything, including the start-of-app pull of rows the page already showed (a new browser profile pulls the whole history, 979 KB for the demo user), and on WebKit its `replaceState` about 2 s after load interrupted the next `page.goto`. Now each synced-data server page renders `<SyncVersionStamp>` with `SyncState.version`, read before the page's own queries, and the hook refreshes only when the sync reached a higher version (CONTRACTS.md, `SyncResult.serverVersion`). Cost: one primary-key read per stamped page. `e2e/journeys/server-refresh.spec.ts` counts the RSC fetches: none after a new user's first load, one after a pushed favorite. With the WebKit-only waits and the `page.goto` retry removed, the progress, sync-policy, sync, today and refresh specs passed 125 of 125 runs (5 skipped by design) on webkit-iphone, five repeats each. On `/today` it runs beside the profile read (no added latency, 8 to 10 queries logged against 9); on the progress, exercises and insights pages it is one more query in front of the others (`/progress/<id>` 5 to 6). Nothing is compared across clocks.

**LCP.** Lighthouse's simulated LCP is not the time the element paints. It is the simulated time to fetch every request that finished before the *observed* LCP in the local (loopback, instant) trace, plus the CPU tasks that laid out. On this machine every resource named in the document head finishes within a few milliseconds of the document, so the floor of every page is the bytes of its first flush: for the progress detail 19 requests and 496 KB (256 KB JavaScript, 188 KB fonts, 37 KB CSS) = 4.06 s at 1.6 Mbps, whatever the LCP element is.

| Page | LCP element | Observed LCP before / after | Simulated LCP before (3 runs: median) | after | Perf (median before / after) |
|---|---|---|---|---|---|
| `/today` | the intro note `p.page-intro__text` (346 x 70) | 0.7 to 1.9 s (it arrived with the streamed page) / 0.12 to 0.22 s (the skeleton) | 4681, 4824, 4824: **4824 ms** | 4210, 4208, 4207: **4208 ms** | 82 / 86 |
| `/progress/<id>` | the chart summary `p#_S_1_-summary` (346 x 81) | 0.50 s / 0.50 s | 4064, 4065, 4064: **4064 ms** | 4069, 4068, 4066: **4068 ms** | 79 / 79 |

- **Why `/today` was later and erratic.** The intro note is server-rendered text, but it sits in the streamed page, after the database reads, so the observed LCP came 0.7 to 1.9 s in. Everything that finished before that moment joined the graph: the start-of-app `/api/sync` pull of a fresh profile (979 KB) and the tab prefetches (`?_rsc=` fetches). A gather run that happened to include the sync simulated **9.9 s**; the runs that did not were 4.7 to 4.8 s. That is the "LCP rose about 600 ms after B2" and the spread between runs: a timing race inside the metric, not slower pages (B2 made the server render faster).
- **Fix (cheap, no cost to B2 or C2):** `today/loading.tsx` renders the same note as real text (`PageIntroPlaceholder`: same words and box, inert, `aria-hidden`, hidden for a dismissed tip), and the page swaps in the identical note. The largest text now paints in the first flush, `/api/sync` and the prefetches end after it and leave the graph, and the three runs agree to 3 ms. Lighthouse perf 82 to 86, LCP -616 ms; TBT and CLS unchanged.
- **Progress detail: no cheap fix, and C2's rise was not reproduced.** The page has no loading boundary on purpose (a `notFound()` must be a real 404), so its first flush is the whole page, observed at TTFB (0.42 to 0.46 s) plus 65 ms, and the graph is the bytes of the head. Three runs on the C2 code gave 4064 to 4069 ms, not 5421. The lazy chart chunks (483 KB) start after hydration, so they enter the graph only when the observed LCP is late enough for them to have finished first (a loaded machine or a slow server), which fits C2's single high run. The only levers left are bytes before first paint: the two Archivo files (188 KB, preloaded, so they finish before the first paint) and about 260 KB of framework and app chunks. Dropping the font preload would take 188 KB out of the graph but lets the italic display face arrive after the headings are painted (see PERF-3, "Skipped"); not done.

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
- PERF-3 specs: `e2e/perf/sync-count.spec.ts` (requests during a scripted 10-set workout; `SYNC_GAP_MS=36000` makes it longer than 5 minutes), `bundle.spec.ts` (JS, CSS and fonts per route) and `prefetch.spec.ts` (first dock tap after a pause). Playwright empties `test-results/` at the start of every run: copy `test-results/perf/*.json` away between invocations.
- Do not run it while other builds or e2e runs are active, and do not run database tests (`pnpm test:integration`) at the same time: they slow the shared Neon branch, and a first run of this harness failed to load the catalog for that reason. Both distort the timings. Always use the production build.
- Web vitals: `window.__overloadVitals` is filled when `localStorage["overload:vitals"] = "1"` or the URL has `?vitals=1` (`src/app/web-vitals.tsx`). Silent otherwise.
- Server timing: with `OVERLOAD_SERVER_TIMING=1` the server logs `[server-timing] html /today db;dur=…;desc="N queries"` per full page request, and `/api/perf/server-timing` serves the recent entries (GET, DELETE to reset). Queries are attributed to a request through an `x-overload-id` header set by `proxy.ts` and a Prisma client extension in `db.ts`. With the flag off nothing is installed.
- The harness leaves the demo user with no active workout (the specs discard theirs).
