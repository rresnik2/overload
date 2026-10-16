// The exercise picker on a throttled Pixel 7: type "bench press" one key at a time. Per keystroke: time until the results change in the
// DOM, time until the next paint (Event Timing), and the long tasks (> 50 ms) it caused.
import { expect, test } from "@playwright/test";
import {
  discardWorkout,
  flushVitals,
  installProbe,
  longTaskStats,
  readProbe,
  REPS,
  report,
  resetProbe,
  signInDemo,
  summarize,
  throttle,
  unthrottle,
  type PerfRow,
} from "./support";

const QUERY = "bench press";
const QUIET_MS = 450;

test("exercise picker: typing 'bench press'", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/workout?vitals=1");
  await page.getByRole("button", { name: "Start empty workout" }).click({ timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 }); // catalog is in Dexie
  const search = picker.getByPlaceholder("Search exercises");

  const cdp = await throttle(page);
  await installProbe(page, { mutationRoot: '[role="dialog"]' });
  await page.waitForTimeout(800);

  const keys: { rep: number; key: string; updateMs: number | null; paintMs: number | null; longTasks: ReturnType<typeof longTaskStats> }[] = [];

  for (let rep = 1; rep <= REPS; rep++) {
    await search.fill("");
    await page.waitForTimeout(QUIET_MS + 300);
    await search.focus();
    for (const key of QUERY) {
      await resetProbe(page);
      await page.keyboard.press(key === " " ? "Space" : key);
      await page.waitForTimeout(QUIET_MS);
      const p = await readProbe(page);
      const down = p.input.find((i) => i.type === "keydown")?.t ?? 0;
      const lastMutation = p.mutations.at(-1);
      // Event Timing for the keydown / keyup / input of this key: from the event to the next paint (8 ms granularity).
      const typed = p.events.filter((e) => e.start >= down - 1 && /^(keydown|keyup|keypress|input|beforeinput)$/.test(e.name));
      keys.push({
        rep,
        key,
        updateMs: lastMutation === undefined ? null : lastMutation - down,
        paintMs: typed.length ? Math.max(...typed.map((e) => e.start + e.duration - down)) : null,
        longTasks: longTaskStats(p.longTasks, down),
      });
    }
    await expect(search).toHaveValue(QUERY);
  }

  await unthrottle(cdp);
  const vitals = await flushVitals(page);
  await page.keyboard.press("Escape");
  await discardWorkout(page);

  const updated = keys.filter((k) => k.updateMs !== null).map((k) => k.updateMs as number);
  const painted = keys.filter((k) => k.paintMs !== null).map((k) => k.paintMs as number);
  // Per rep: the whole phrase, key to last result update (sum of per-key updates), to compare runs with one number.
  const perRep = Array.from({ length: REPS }, (_, i) => keys.filter((k) => k.rep === i + 1).reduce((a, k) => a + (k.updateMs ?? 0), 0));
  const rows: PerfRow[] = [
    { metric: "keystroke -> results updated", unit: "ms", summary: updated.length ? summarize(updated) : null, note: `${updated.length}/${keys.length} keys changed the results` },
    { metric: "keystroke -> next paint (Event Timing)", unit: "ms", summary: painted.length ? summarize(painted) : null, note: `${painted.length}/${keys.length} keys over 16 ms` },
    { metric: "11 keystrokes, summed update time", unit: "ms", summary: summarize(perRep) },
    { metric: "per keystroke: long tasks > 50 ms", unit: "n", summary: summarize(keys.map((k) => k.longTasks.count)) },
    { metric: "per keystroke: longest task", unit: "ms", summary: summarize(keys.map((k) => k.longTasks.maxMs)) },
    { metric: "per phrase: blocking time over 50 ms", unit: "ms", summary: summarize(Array.from({ length: REPS }, (_, i) => keys.filter((k) => k.rep === i + 1).reduce((a, k) => a + k.longTasks.blockingMs, 0))) },
  ];
  const inp = vitals.filter((v) => v.name === "INP").at(-1);
  rows.push({ metric: "INP (vitals)", unit: "ms", summary: inp ? summarize([inp.value]) : null, note: inp?.rating });
  report("picker", rows, { keys, vitals });
});
