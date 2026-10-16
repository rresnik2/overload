# DIAL-1: classify the PERF-0 files in ownership.json

**What**: add to `ownership.json` -> `integration` (same place UX put `e2e/ux.spec.ts`):

    "e2e/perf/**",
    "src/server/perf/**",
    "src/app/api/perf/**",
    "src/app/web-vitals.tsx",
    "src/app/server-timing-probe.tsx",

**Why**: `scripts/ownership.test.ts` ("every tracked file is owned, frozen or shared") fails, so `pnpm check` is red, until these new measurement files are classified. `ownership:check --stream=DIAL` itself passes (DIAL is unrestricted).

**Workaround**: none needed to keep working; the only red check is that one unit test. (The edit to the frozen `ownership.json` was refused in this session, so it was not made.)
