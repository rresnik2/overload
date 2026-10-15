// Sync engine end to end (needs a database: DATABASE_URL in .env.local, migrated).
// The specs drive the engine from the browser through `window.__overload = { repo, syncNow }`, which SyncProvider exposes
// ONLY when process.env.NODE_ENV !== "production" (so run this against `pnpm dev`, not a production build).
// Test credentials are generated here for this run only.
import { expect, test, type Browser, type Page } from "@playwright/test";

type Overload = {
  repo: {
    exercises: { create(input: unknown): Promise<{ id: string }>; get(id: string): Promise<{ name: string } | undefined> };
    workouts: { create(input: unknown): Promise<{ id: string }>; update(id: string, patch: unknown): Promise<unknown>; get(id: string): Promise<{ title: string | null; deletedAt: string | null } | undefined>; remove(id: string): Promise<void> };
    workoutExercises: { create(input: unknown): Promise<{ id: string }> };
    sets: {
      create(input: unknown): Promise<{ id: string }>;
      update(id: string, patch: unknown): Promise<unknown>;
      get(id: string): Promise<{ weightKg: number | null; reps: number | null; notes: string | null; effectiveLoadKg: number | null; e1rmKg: number | null; version: number; seriesKey: string } | undefined>;
    };
  };
  syncNow(reason?: string): Promise<{ ok: boolean; pushed: number; pulled: number; rejected: number; skipped?: boolean; error?: string }>;
};

const credentials = () => ({
  email: `sync-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`,
  password: `pw-${Math.random().toString(36).slice(2)}-Aa1!`,
});

async function ready(page: Page) {
  await page.waitForFunction(() => Boolean((window as unknown as { __overload?: unknown }).__overload), undefined, { timeout: 60_000 });
}

/** Run `fn` in the page with the dev hook. `fn` and `arg` must be serializable. */
function inPage<R, A = undefined>(page: Page, fn: (o: Overload, arg: A) => Promise<R> | R, arg?: A): Promise<R> {
  return page.evaluate(
    ([source, a]) => (new Function("o", "arg", `return (${source})(o, arg)`) as (o: unknown, arg: unknown) => Promise<unknown>)((window as unknown as { __overload: unknown }).__overload, a),
    [fn.toString(), arg] as const,
  ) as Promise<R>;
}

/**
 * A manual sync is skipped while another one (e.g. the engine's own 1.5 s write trigger) is running, so retry until one of OUR calls
 * actually ran: it then covers every write made before it.
 */
const SYNC_UNTIL_RAN = `async (o) => {
  for (let i = 0; i < 100; i++) {
    const r = await o.syncNow("manual");
    if (!r.skipped) return r;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("sync was skipped 100 times in a row");
}`;
async function syncAll(page: Page) {
  // `next dev` reloads a page when its HMR socket reconnects after being offline; the Dexie data survives, so just wait and retry.
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(
        (source) => (new Function("o", `return (${source})(o)`) as (o: unknown) => Promise<{ ok: boolean; pushed: number; pulled: number; rejected: number }>)((window as unknown as { __overload: unknown }).__overload),
        SYNC_UNTIL_RAN,
      );
    } catch (error) {
      if (attempt >= 3 || !/context was destroyed|navigation/i.test(String(error))) throw error;
      await page.waitForLoadState("load");
      await ready(page);
    }
  }
}

async function signUp(page: Page, email: string, password: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Sync Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await ready(page);
}

async function signIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await ready(page);
  return { context, page };
}

test("two browser contexts of one user converge in both directions; an offline edit syncs after going online", async ({ browser }) => {
  test.setTimeout(180_000);
  const { email, password } = credentials();
  const context1 = await browser.newContext();
  const page1 = await context1.newPage();
  await signUp(page1, email, password);
  const { context: context2, page: page2 } = await signIn(browser, email, password);

  // 1. Device 1 logs a set while "at the gym" and syncs.
  const ids = await inPage(page1, async (o) => {
    const exercise = await o.repo.exercises.create({ slug: "e2e-press", name: "E2E Press", modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL" });
    const workout = await o.repo.workouts.create({ startedAt: new Date().toISOString(), localDate: new Date().toISOString().slice(0, 10), timezone: "UTC", title: "Push" });
    const we = await o.repo.workoutExercises.create({ workoutId: workout.id, exerciseId: exercise.id, position: "a0" });
    const set = await o.repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 100, reps: 5, rir: 0, completedAt: new Date().toISOString() });
    let result = await o.syncNow("manual");
    for (let i = 0; i < 100 && result.skipped; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      result = await o.syncNow("manual");
    }
    return { exercise: exercise.id, workout: workout.id, set: set.id, result };
  });
  expect(ids.result).toMatchObject({ ok: true, rejected: 0 });
  expect(ids.result.pushed).toBeGreaterThanOrEqual(4);

  // 2. Device 2 pulls it, including the server-derived columns.
  const r2 = await syncAll(page2);
  const pulled = { r: r2, set: await inPage(page2, (o, id) => o.repo.sets.get(id), ids.set) };
  expect(pulled.r.ok).toBe(true);
  expect(pulled.set).toMatchObject({ weightKg: 100, reps: 5, effectiveLoadKg: 100, e1rmKg: 116.667, seriesKey: ids.exercise });
  expect(pulled.set?.version).toBeGreaterThan(0);

  // 3. Concurrent edits to different fields converge on both devices.
  await inPage(page1, async (o, id) => void (await o.repo.sets.update(id, { reps: 8 })), ids.set);
  await inPage(page2, async (o, id) => void (await o.repo.sets.update(id, { notes: "felt heavy" })), ids.set);
  for (const page of [page1, page2, page1]) await syncAll(page);
  const [a, b] = await Promise.all([page1, page2].map((p) => inPage(p, (o, id) => o.repo.sets.get(id), ids.set)));
  expect(a).toMatchObject({ reps: 8, notes: "felt heavy", weightKg: 100 });
  expect(b).toMatchObject({ reps: 8, notes: "felt heavy", weightKg: 100 });

  // 4. An offline edit stays pending, then syncs after going online and reaches the other device.
  await context1.setOffline(true);
  const offline = await inPage(page1, async (o, id) => {
    await o.repo.workouts.update(id, { title: "Edited offline" });
    let r = await o.syncNow("manual");
    for (let i = 0; i < 100 && r.skipped; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      r = await o.syncNow("manual");
    }
    return r;
  }, ids.workout);
  expect(offline.ok).toBe(false);
  await context1.setOffline(false); // the engine's own `online` trigger starts syncing; an explicit call joins or follows it
  await syncAll(page1);
  await expect
    .poll(
      () =>
        inPage(
          page2,
          async (o, id) => {
            await o.syncNow("manual");
            return (await o.repo.workouts.get(id))?.title;
          },
          ids.workout,
        ),
      { timeout: 30_000 },
    )
    .toBe("Edited offline");

  // 5. A delete converges too.
  await inPage(page2, async (o, id) => o.repo.workouts.remove(id), ids.workout);
  await syncAll(page2);
  await syncAll(page1);
  const afterDelete = await inPage(
    page1,
    async (o, a) => ({ workout: await o.repo.workouts.get(a.workout), set: await o.repo.sets.get(a.set) }),
    { workout: ids.workout, set: ids.set },
  );
  expect(afterDelete.workout).toBeUndefined();
  expect(afterDelete.set).toBeUndefined(); // the orphan rule took the set with its workout

  await context1.close();
  await context2.close();
});
