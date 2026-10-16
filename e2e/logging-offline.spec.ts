// Offline-first logging end to end (stream E2). Production build: the service worker must have cached /workout.
//   PORT=3001 E2E_PROD=1 pnpm exec playwright test e2e/logging-offline.spec.ts --project=webkit-iphone
// Go offline -> add a free-weight and a machine exercise (with a new MachineProfile) -> log 9 sets -> reload (still offline, data
// still there) -> go online -> the outbox drains -> a second browser context and the database both show exactly 9 sets.
import { expect, test, type Page } from "@playwright/test";
import { dialWeight, logSetByTyping, setRepsOnStrip } from "./helpers/logging";
import { resetRateLimitsIfProduction, createUser } from "./_support/user";

const FREE_WEIGHT = "Barbell Bench Press - Medium Grip";
const MACHINE = "Ab Crunch Machine";
const DUMBBELL = "Dumbbell Bench Press";

/** The e2e user's set rows in the database (the worktree's own Neon branch, read through the app's prisma client). */
async function dbSetCount(email: string): Promise<{ sets: number; machineSets: number }> {
  const before = new Set(Object.keys(process.env));
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* CI provides DATABASE_URL */
  }
  for (const key of Object.keys(process.env)) if (!before.has(key) && !/^DATABASE_(URL|POOL_MAX)$/.test(key)) delete process.env[key];
  const { prisma } = await import("@/server/db");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const sets = await prisma.workoutSet.findMany({ where: { userId: user.id, deletedAt: null, completedAt: { not: null } }, select: { machineProfileId: true } });
  return { sets: sets.length, machineSets: sets.filter((s) => s.machineProfileId !== null).length };
}

async function addExercise(page: Page, search: string, name: string) {
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await picker.getByPlaceholder("Search exercises").fill(search);
  // exact: every row also has a star named "Add <name> to favorites", which a substring match would pick first
  await picker.getByRole("button", { name: `Add ${name}`, exact: true }).first().click();
}

/** Fill and complete set `n` (1-based) of an exercise block: typed into the row on a desktop, through the panel on a phone. */
const logSet = logSetByTyping;

test("offline: log 9 sets, reload, sync drains, the server has exactly 9", async ({ page, context, browser, isMobile }) => {
  test.setTimeout(300_000);
  const { email, password } = await createUser(page, { tag: "logging", name: "Offline Logger" });

  // Online first: let the service worker take control, cache the /workout page and its chunks, and let the catalog sync into Dexie.
  await page.goto("/workout");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller) || !("serviceWorker" in navigator), undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await expect(page.getByRole("dialog").locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 }); // catalog is in Dexie
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // ---- offline from here ----
  await context.setOffline(true);

  await addExercise(page, "barbell bench press", FREE_WEIGHT);
  const bench = page.getByRole("region", { name: FREE_WEIGHT });
  await expect(bench).toBeVisible();
  for (let n = 1; n <= 5; n++) {
    if (n > 1) await bench.getByRole("button", { name: `Add set to ${FREE_WEIGHT}` }).click();
    await logSet(bench, n, String(60 + n * 2.5), String(10 - n), isMobile);
  }

  await addExercise(page, "ab crunch machine", MACHINE);
  // No machine exists yet: the machine step asks for a MachineProfile (its own progression series).
  await page.getByLabel("Machine name").fill("Gym A crunch");
  await page.getByLabel("Gym", { exact: true }).fill("Gym A");
  await page.getByRole("button", { name: "Save and add" }).click();
  const crunch = page.getByRole("region", { name: MACHINE });
  await expect(crunch).toBeVisible();
  await expect(crunch.getByText("Gym A crunch")).toBeVisible();
  for (let n = 1; n <= 4; n++) {
    if (n > 1) await crunch.getByRole("button", { name: `Add set to ${MACHINE}` }).click();
    await logSet(crunch, n, String(30 + n * 5), "12", isMobile);
  }
  await expect(page.locator('.wk-set[data-state="completed"]')).toHaveCount(9);
  if (!isMobile) await expect(crunch.getByText("stack", { exact: false }).first()).toBeVisible(); // STACK label on the machine's rows

  // The rest timer is running and persisted.
  await expect(page.getByTestId("rest-clock")).toBeVisible();

  // ---- reload while still offline: everything comes from the cached page + Dexie ----
  await page.reload();
  await expect(page.locator('.wk-set[data-state="completed"]')).toHaveCount(9, { timeout: 60_000 });
  await expect(page.getByRole("region", { name: FREE_WEIGHT })).toBeVisible();
  await expect(page.getByRole("region", { name: MACHINE }).getByText("Gym A crunch")).toBeVisible();
  await expect(page.getByTestId("rest-clock")).toBeVisible(); // the rest timer survived the reload

  // Finish while offline: the workout is saved locally.
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  const summary = page.getByTestId("finish-summary");
  await expect(summary).toBeVisible();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // ---- back online: the outbox drains ----
  await context.setOffline(false);
  await expect.poll(() => dbSetCount(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toEqual({ sets: 9, machineSets: 4 });
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, { timeout: 60_000 });

  // ---- a fresh browser context (new Dexie) pulls exactly those 9 sets from the server ----
  const second = await browser.newContext();
  const other = await second.newPage();
  await resetRateLimitsIfProduction(other);
  await other.goto("/sign-in");
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill(password);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(other).toHaveURL(/\/today$/, { timeout: 60_000 });
  await other.goto("/history");
  const card = other.getByRole("article").first();
  await expect(card).toContainText("9 sets", { timeout: 60_000 });
  await expect(card).toContainText("2 exercises");
  await card.getByRole("link").click();
  await expect(other.locator(".wk-set")).toHaveCount(9, { timeout: 30_000 });
  await second.close();
  expect((await dbSetCount(email)).sets).toBe(9);
});

test("a heavier second session shows the PR toast, and the rest timer survives a reload", async ({ page, isMobile }) => {
  test.setTimeout(240_000);
  await createUser(page, { tag: "pr", name: "PR Logger" });
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await addExercise(page, "barbell bench press", FREE_WEIGHT);
  const first = page.getByRole("region", { name: FREE_WEIGHT });
  await logSet(first, 1, "100", "5", isMobile);
  await page.getByRole("button", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByRole("heading", { name: "Workout saved" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible();

  // Second session (same day, so no "last time" ghost: that only looks at earlier dates): beat the first set.
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await addExercise(page, "barbell bench press", FREE_WEIGHT);
  const second = page.getByRole("region", { name: FREE_WEIGHT });
  await logSet(second, 1, "105", "5", isMobile);
  await expect(page.locator(".toast--pr")).toContainText(FREE_WEIGHT);
  await expect(second.locator(".wk-set--pr")).toHaveCount(1);

  // The rest timer started on completion and keeps its absolute end time over a reload.
  const before = await page.getByTestId("rest-clock").textContent();
  expect(before).toMatch(/^[01]:\d\d$/);
  await page.reload();
  await expect(page.getByTestId("rest-clock")).toBeVisible({ timeout: 60_000 });
  const secs = (t: string | null) => Number(t?.split(":")[0]) * 60 + Number(t?.split(":")[1]);
  expect(secs(await page.getByTestId("rest-clock").textContent())).toBeLessThanOrEqual(secs(before));
  await expect(page.getByRole("region", { name: FREE_WEIGHT }).locator(".wk-set--pr")).toHaveCount(1); // PR badge recomputed from history
});

test("phone: turn the dial for a barbell set, go offline, log a dumbbell set, come back online and both sync", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "the dial is the phone layout: run with --project=webkit-iphone");
  test.setTimeout(300_000);
  const { email } = await createUser(page, { tag: "dial", name: "Dial Logger" });

  // Online first: the service worker takes control and the catalog syncs into Dexie, as in the offline test above.
  await page.goto("/workout");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller) || !("serviceWorker" in navigator), undefined, { timeout: 60_000 }).catch(() => undefined);
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  await expect(page.getByRole("dialog").locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // ---- online: a barbell set by dial. Home is the empty bar (20 kg), PageUp is four steps of 2.5 kg: 20 -> 60 ----
  await addExercise(page, "barbell bench press", FREE_WEIGHT);
  const bench = page.getByRole("region", { name: FREE_WEIGHT });
  await expect(bench.locator("li.wk-panel")).toHaveCount(1);
  const dial = await dialWeight(bench, 1, ["Home", "PageUp", "PageUp", "PageUp", "PageUp"]);
  await expect(dial).toHaveAttribute("aria-valuetext", "60 kilograms total");
  await expect(bench.getByRole("button", { name: /^Set 1 weight 60, tap to type/ })).toHaveText("60");
  await expect(bench.getByRole("img", { name: "Bar loaded with 20 kilograms per side" })).toBeVisible();
  await setRepsOnStrip(bench, 1, 5);
  await bench.getByRole("button", { name: "Set 1 RIR 2" }).click();
  await bench.getByRole("button", { name: "Log set · 60 kg × 5" }).click();
  await expect(bench.getByRole("button", { name: "Logged ✓" })).toBeVisible();
  await expect(page.locator('.wk-set[data-state="completed"]')).toHaveCount(1);
  await expect.poll(() => dbSetCount(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toEqual({ sets: 1, machineSets: 0 });

  // ---- offline: a dumbbell set (2 kg steps per hand: Home is 2, PageUp x3 is 26) ----
  await context.setOffline(true);
  await addExercise(page, "dumbbell bench press", DUMBBELL);
  const dumbbell = page.getByRole("region", { name: DUMBBELL });
  await expect(dumbbell.locator("li.wk-panel")).toHaveCount(1);
  const heads = await dialWeight(dumbbell, 1, ["Home", "PageUp", "PageUp", "PageUp"]);
  await expect(heads).toHaveAttribute("aria-valuetext", "26 kilograms per hand");
  await expect(dumbbell.getByText("Pair of 26 kg · 52 kg total")).toBeVisible();
  await setRepsOnStrip(dumbbell, 1, 8);
  await dumbbell.getByRole("button", { name: "Log set · 26 kg × 8" }).click();
  await expect(dumbbell.getByRole("button", { name: "Logged ✓" })).toBeVisible();
  await expect(page.locator('.wk-set[data-state="completed"]')).toHaveCount(2);

  // ---- back online: the outbox drains and the server has both sets ----
  await context.setOffline(false);
  await expect.poll(() => dbSetCount(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toEqual({ sets: 2, machineSets: 0 });
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, { timeout: 60_000 });
});
