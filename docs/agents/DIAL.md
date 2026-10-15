# Stream DIAL: the Calibrated Dial redesign

Owner request: replace the editorial look (paper, Instrument Serif, vermilion) with direction **A+B “Calibrated Dial”**: a rubber-floor dark palette built from competition plate colours, condensed italic Archivo, and a plate-face rotary dial for weight entry on phones, with an equipment picture that reacts as the dial turns.

**The spec is the source of truth:** `docs/design/calibrated-dial-handoff.html` (tokens, layout, components and props, equipment pictures, dial behaviour, states, motion, content rules, edge cases, accessibility, haptics, decisions D1–D7, definition of done). The visual reference, with working SVG geometry and dial code you may port, is the `#dial` section of `docs/design/overload-directions-mockup.html` (search for `A+B · CALIBRATED DIAL`). Read the spec in full before writing code.

Ownership is unrestricted for this stream (`ownership.json`), but **each agent stays inside its own part below** so parallel branches merge cleanly. List every frozen file you changed in your report.

## Rules for every part
- Follow `CLAUDE.md` exactly: pnpm only; never add, remove or upgrade a dependency; never `prisma@latest`; never `prisma migrate dev`; never print, log or commit secrets; never push, deploy or open PRs.
- Read `AGENTS.md` / the Next 16 docs in `node_modules/next/dist/docs/` before using Next APIs from memory.
- First run `pnpm install --frozen-lockfile` in your worktree. Only run `pnpm db:branch <KEY>` (KEY given in your part) if your part needs a database; it copies the owner's `.env.local` and points it at your own Neon branch.
- Commit in logical chunks on your worktree branch with messages starting `dial(<part>): `. End each commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Before reporting: `pnpm check` and `pnpm build` must pass; `pnpm ownership:check --stream=DIAL` must pass.
- Report: what is done, test output (pass/fail counts), deviations from the spec and why, frozen files changed, anything not run or not verified. Be honest.

## Wave 1 (parallel)

### Part CORE: foundations and change requests (db key: `UX`)
1. **Schema (D6):** add a nullable plate-weight list `platesKg` to `MachineProfile` (`Decimal[]` with the same precision as `baseLoadKg`, nullable / empty means “standard set”). Write the migration with `pnpm exec prisma migrate diff --from-schema <main's schema file> --to-schema prisma/schema.prisma --script` into a new `prisma/migrations/<timestamp>_machine_profile_plates/migration.sql` (see how the `FAT_LOSS` migration was done). Update `machineProfileFieldsSchema` in `src/contracts/entities.ts` (array of numbers, each 0–100, max 20 items, default null), the mapper in `src/server/mappers/` (Decimal → number), fixtures, and anything TypeScript flags. Check the sync path (`src/server/sync/**`, `src/lib/sync/**`, `src/client/db/**`) handles an array field per the HLC/field rules; add a test that a profile with `platesKg` round-trips through sync apply and pull. `pnpm db:branch UX`, `pnpm db:deploy`, `pnpm test:integration`.
2. **Fonts:** in `src/app/layout.tsx` replace Instrument Serif + Newsreader with **Archivo** from `next/font/google` (variable, `axes: ["wdth"]`, normal + italic), exposing CSS variables so `--font-display` and `--font-body` both resolve to Archivo. Check Archivo has a `tnum` feature; if not, keep `--font-numeric` on a mono fallback.
3. **Theme tokens:** in `src/styles/theme.css` replace the two daisyUI themes with `overload-floor` (dark, `prefersdark: true`) and `overload-daylight` (light, `default: true`) with exactly the values, radii and custom tokens in spec §03 (plate colours, `--color-line-strong`, `--color-muted`, `--color-up`, `--color-accent-ink`, `--steel`, spacing, `--dial-size`, `--picture-h`, type tokens). Update the inline theme script / stored theme names if they reference the old names (search for `overload-paper` / `overload-ink` across `src/` and `e2e/`). **Keep legacy aliases** so nothing breaks before wave 2: `--color-vermilion` → primary, `--shadow-hard*` → `none`, `--font-instrument`/`--font-newsreader` → Archivo. Mark them `/* LEGACY: removed after wave 2 */`.
4. **Glossary:** add `weightDial`, `barProfile`, `plateInventory` to `src/lib/glossary.ts` (load `design:ux-copy` first; ≤ 200 characters each, plain second person) and keep the glossary test green.
5. **Rules text:** update the design rule in `CLAUDE.md` (“Design:” bullet) and the “Fonts” section of `CONTRACTS.md` to describe the new system (Archivo, plate palette, 4/6 px radii, plate colours never decorative). Do not run `pnpm docs:sync` unless CONTRACTS.md signature blocks drift (CI checks them).

### Part UI: `Dial` and `NumberStrip` primitives (db key: none; dev port 3002 if needed)
- `src/components/ui/Dial.tsx` and `src/components/ui/NumberStrip.tsx` with **exactly** the props in spec §05 (including `labelHint?: TermId`, matching `NumberStepper`). Behaviour per spec §07, §08, §09, §12: pointer-angle detents, clockwise increases, limit bump, focused-only mouse wheel, `touch-action: none` on the dial only, and **a visually hidden native `<input type="range">` as the accessibility source of truth** (SVG `aria-hidden`). `NumberStrip` uses native scroll-snap on touch, drag on mouse, arrow keys, stays in sync with `value`.
- Styles go in `src/styles/primitives.css` using the spec token names (`--dial-size`, `--color-primary`, `--color-line-strong`, …) with sensible fallbacks, since CORE lands the tokens in parallel.
- Tests in `src/components/ui/ui.dom.test.tsx` (or a new `dial.dom.test.tsx`): keyboard steps, limits, hidden range sync, `onDetent` direction, disabled, `NumberStrip` keys and value sync.
- Add both to `/styleguide` (`src/app/styleguide/`).
- Touch only those files.

### Part PLATES: pure plate maths and the haptics helper (db key: none)
- `src/components/workout/plates.ts` (pure: no react, no DOM) with the exports in spec §05 and the rules in §06 and decisions D1, D5, D6: `PLATES` (kg and lb sets, tones, heights, widths), `DEFAULT_BAR_WEIGHT`, `plateSet`, `loadBar`, `loadSide`, `loadableTotals`, `KETTLEBELL_SIZES` (kg and lb lists), `dialValues`, `pinFor`, plus small helpers the UI will need (kettlebell colour and ink by size, dumbbell and kettlebell scale factors, “inexact” caption data). Reuse `src/lib/units.ts` (`fromKg`, `toKg`, `round`, `defaultIncrement`).
- `src/components/workout/plates.test.ts` covering every case listed in spec §15, plus property tests with `fast-check` (already a dependency) that loadouts never exceed the target and are exact whenever the target is in `loadableTotals`.
- `src/components/workout/haptics.ts` per spec §13: `tick()`, `confirm()`, a 35 ms throttle, Android Vibration API, the iOS `<input type="checkbox" switch>` technique, silent no-op elsewhere, and a per-device enabled flag stored like `src/components/ui/tips.ts` (`overload:haptics-off`, `useSyncExternalStore`, try/catch). Unit tests with mocked `navigator.vibrate` and storage.
- Touch only those files.

## Wave 2 (after wave 1 is merged into `design/calibrated-dial`)

### Part LOGGING: the mobile set editor (db key: `E2`, port 3001)
`EquipmentPicture`, `WeightReadout`, `ActiveSetPanel`, `SetRow` compact variant, the active-set switch in `ExerciseBlock` (keep `SetLegend`), `MachineProfileForm` `kind: "bar"` with plate checkboxes and the “Bar and plates” link (D1, D6), desktop typing-only with picture preview (D3), `LoggingGuide` copy for the dial, the Haptics toggle under “Show tips” in Settings → Profile, `workout.css` restyled off legacy tokens. DOM tests, `e2e/logging-offline.spec.ts` dial flow on webkit-iphone, `e2e/ux.spec.ts` still green.

### Part RESTYLE: every other partial (db key: `B`, port 3002)
`shell`, `motion`, `primitives` (non-dial parts), `auth`, `catalog`, `progress`, `insights`, `hints` partials off `vermilion` / `shadow-hard` / Instrument Serif to the new tokens; chart palette per spec §03 validated with the `dataviz` skill; axe in both themes.

### Part TODAY: Today restyle and new content (db key: `W3`, port 3000)
Spec §04 breakpoints and D4: `PageIntro`, start card, templates card, e1RM tiles for the four main lifts with 4-week change, bench e1RM chart, hard sets, insight, bodyweight; `today.css`; empty states; `e2e/today.spec.ts`.

## Wave 3 (coordinator)
Merge, remove the legacy aliases once nothing references them, full `pnpm check` / `pnpm build`, e2e on chromium and webkit-iphone, regenerate and review visual baselines on a production build.
