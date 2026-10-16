// /workout with an active exercise on a throttled Pixel 7: a 10-detent drag on the dial face (touch pointer events through CDP).
// Records the time from pointerdown until the weight readout stops changing, the lag of the readout behind the finger, and the
// long tasks (> 50 ms) during the drag. Directions alternate so the weight stays near where it started.
import { expect, test } from "@playwright/test";
import {
  browserMetrics,
  countIndexedDb,
  discardWorkout,
  flushVitals,
  installProbe,
  installWorkCounters,
  longTaskStats,
  readProbe,
  readWork,
  REPS,
  report,
  resetProbe,
  resetWork,
  signInDemo,
  startWorkoutWithExercise,
  summarize,
  throttle,
  unthrottle,
  type PerfRow,
} from "./support";

const EXERCISE = "Barbell Bench Press - Medium Grip";
const DETENTS = 10;
const DETENT_DEG = 12; // Dial's default
const MOVES = 24;
const MOVE_GAP_MS = 16;

test("dial drag: 10 detents", async ({ page }) => {
  await countIndexedDb(page);
  await signInDemo(page);
  await startWorkoutWithExercise(page, "barbell bench press", EXERCISE);
  const face = page.locator(".dial__face").first();
  await expect(face).toBeVisible();
  await face.scrollIntoViewIfNeeded(); // the dial sits below the fold on a Pixel 7; touches outside the viewport do nothing
  const range = page.getByRole("slider", { name: /^Set 1 weight/ });
  const cdp = await throttle(page);
  await page.waitForTimeout(1000);

  await installProbe(page, { mutationRoot: ".wk-panel__read", mutationFilter: ".wk-readout__num" });
  await installWorkCounters(page);
  await cdp.send("Performance.enable");
  const samples: {
    rep: number;
    dir: number;
    settleMs: number;
    lagMs: number;
    changes: number;
    longTasks: ReturnType<typeof longTaskStats>;
    detents: number;
    work: Awaited<ReturnType<typeof readWork>>;
    layouts: number;
    recalcs: number;
    scriptMs: number;
  }[] = [];

  for (let rep = 1; rep <= REPS; rep++) {
    const dir = rep % 2 === 1 ? 1 : -1; // clockwise raises the weight
    await resetProbe(page);
    await resetWork(page);
    const before = await browserMetrics(cdp);
    const box = (await face.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const radius = box.width * 0.38;
    const startIdx = Number(await range.inputValue());
    // Sweep 10.5 detents of angle so all ten land even with the integer accumulation in the dial.
    const sweep = (DETENTS + 0.5) * DETENT_DEG;
    const point = (deg: number) => ({ x: cx + radius * Math.cos(((deg - 90) * Math.PI) / 180), y: cy + radius * Math.sin(((deg - 90) * Math.PI) / 180) });
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", deg: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ ...point(deg), id: 1 }] });

    await touch("touchStart", 0);
    for (let i = 1; i <= MOVES; i++) {
      await touch("touchMove", (dir * sweep * i) / MOVES);
      await page.waitForTimeout(MOVE_GAP_MS);
    }
    await touch("touchEnd", dir * sweep);
    await page.waitForTimeout(800); // let the Dexie write, the live query and the sync trigger finish

    const after = await browserMetrics(cdp);
    const work = await readWork(page);
    const p = await readProbe(page);
    const down = p.input.find((i) => i.type === "pointerdown")?.t ?? 0;
    const moves = p.input.filter((i) => i.type === "pointermove");
    const lastMove = moves.at(-1)?.t ?? down;
    const lastChange = p.mutations.at(-1) ?? down;
    const endIdx = Number(await range.inputValue());
    samples.push({
      rep,
      dir,
      settleMs: lastChange - down,
      lagMs: lastChange - lastMove,
      changes: p.mutations.length,
      longTasks: longTaskStats(p.longTasks, down),
      detents: endIdx - startIdx,
      work,
      layouts: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
      recalcs: (after.RecalcStyleCount ?? 0) - (before.RecalcStyleCount ?? 0),
      scriptMs: Math.round(((after.ScriptDuration ?? 0) - (before.ScriptDuration ?? 0)) * 1000),
    });
  }

  await unthrottle(cdp);
  const vitals = await flushVitals(page);
  await discardWorkout(page);

  const rows: PerfRow[] = [
    { metric: "drag: pointerdown -> readout settled", unit: "ms", summary: summarize(samples.map((s) => s.settleMs)) },
    { metric: "drag: readout lag after last move", unit: "ms", summary: summarize(samples.map((s) => s.lagMs)) },
    { metric: "drag: readout updates", unit: "n", summary: summarize(samples.map((s) => s.changes)) },
    { metric: "drag: long tasks > 50 ms", unit: "n", summary: summarize(samples.map((s) => s.longTasks.count)) },
    { metric: "drag: longest task", unit: "ms", summary: summarize(samples.map((s) => s.longTasks.maxMs)) },
    { metric: "drag: blocking time (sum over 50 ms)", unit: "ms", summary: summarize(samples.map((s) => s.longTasks.blockingMs)) },
    { metric: "drag: IndexedDB read-write transactions", unit: "n", summary: summarize(samples.map((s) => s.work.rw)) },
    { metric: "drag: IndexedDB read-only transactions", unit: "n", summary: summarize(samples.map((s) => s.work.ro)) },
    { metric: "drag: DOM mutation batches under .wk-active (about one per commit)", unit: "n", summary: summarize(samples.map((s) => s.work.batches)) },
    { metric: "drag: DOM mutation records under .wk-active", unit: "n", summary: summarize(samples.map((s) => s.work.records)) },
    { metric: "drag: style recalculations", unit: "n", summary: summarize(samples.map((s) => s.recalcs)) },
    { metric: "drag: layouts", unit: "n", summary: summarize(samples.map((s) => s.layouts)) },
    { metric: "drag: script time", unit: "ms", summary: summarize(samples.map((s) => s.scriptMs)) },
  ];
  const inp = vitals.filter((v) => v.name === "INP").at(-1);
  rows.push({ metric: "INP (vitals)", unit: "ms", summary: inp ? summarize([inp.value]) : null, note: inp?.rating });
  report("dial", rows, { samples, vitals });

  // The drag has to have turned the dial ten detents each time, or the numbers above measure nothing.
  for (const s of samples) expect(Math.abs(s.detents), `rep ${s.rep} moved ${s.detents} detents`).toBeGreaterThanOrEqual(DETENTS - 1);
});
