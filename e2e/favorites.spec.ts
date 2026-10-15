// Favorite exercises and keyword search, end to end (stream FAV). Production build so the service worker and offline work:
//   PORT=3004 E2E_PROD=1 pnpm exec playwright test e2e/favorites.spec.ts --project=chromium --project=webkit-iphone
// Star in the library -> fav=1 lists it -> start a workout: it sits under Favorites in the picker -> go offline, unstar it in the picker
// -> go online -> the library no longer lists it under fav=1. And "incline db" finds Incline Dumbbell Press in the picker.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createUser } from "./_support/user";

const LEG_PRESS = "Leg Press";

/** The e2e user's favorite rows in the database (the worktree's own Neon branch, read through the app's prisma client). */
async function dbFavorites(email: string): Promise<{ name: string; deleted: boolean }[]> {
  const before = new Set(Object.keys(process.env));
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* CI provides DATABASE_URL */
  }
  for (const key of Object.keys(process.env)) if (!before.has(key) && !/^DATABASE_(URL|POOL_MAX)$/.test(key)) delete process.env[key];
  const { prisma } = await import("@/server/db");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const rows = await prisma.exerciseFavorite.findMany({ where: { userId: user.id }, include: { exercise: { select: { name: true } } } });
  return rows.map((r) => ({ name: r.exercise.name, deleted: r.deletedAt !== null })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Wait until the first sync has put the catalog into the local database (a picker card exists), then close the picker again. */
async function startWorkoutAndOpenPicker(page: Page) {
  await page.goto("/workout");
  await expect(page.getByRole("button", { name: "Start empty workout" })).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Start empty workout" }).click();
  await expect(page.getByRole("textbox", { name: "Workout name" })).toBeVisible();
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog");
  await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 60_000 });
  return picker;
}

test("star in the library, find it under Favorites in the picker, unstar offline, and the library follows after sync", async ({ page, context }) => {
  test.setTimeout(300_000);
  const { email } = await createUser(page, { tag: "fav", name: "Fav Tester" });

  // 1. Library: star Leg Press (found by keyword), then the Favorites filter lists it (server-rendered, no JS needed).
  await page.goto("/exercises?q=leg+press");
  const star = page.getByRole("button", { name: `Add ${LEG_PRESS} to favorites`, exact: true });
  await expect(star).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible({ timeout: 60_000 }); // the first sync (and the catalog) landed
  await star.click();
  const unstar = page.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true });
  await expect(unstar).toBeVisible();
  await expect(unstar).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => dbFavorites(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toEqual([{ name: LEG_PRESS, deleted: false }]);

  await page.goto("/exercises?fav=1");
  await expect(page.getByRole("link", { name: "Favorites" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: LEG_PRESS, level: 2 })).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(1);
  await expect(page.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true })).toHaveAttribute("aria-pressed", "true");

  // 2. Start a workout: the picker shows it under Favorites (and the keyword search finds Incline Dumbbell Press for "incline db").
  const picker = await startWorkoutAndOpenPicker(page);
  const favorites = picker.getByRole("region", { name: "Favorite exercises" });
  await expect(favorites.getByRole("heading", { name: LEG_PRESS, level: 3 })).toBeVisible();
  await expect(picker.getByText("Star an exercise to pin it here.")).toBeHidden();
  await picker.getByPlaceholder("Search exercises").fill("incline db");
  await expect(picker.getByRole("heading", { name: "Incline Dumbbell Press", level: 3 })).toBeVisible();
  const names = await picker.locator(".exercise-card__name").allTextContents();
  expect(names.slice(0, 3)).toContain("Incline Dumbbell Press");
  expect(names.every((n) => /incline/i.test(n))).toBe(true);
  await picker.getByPlaceholder("Search exercises").fill("");
  await expect(favorites.getByRole("heading", { name: LEG_PRESS, level: 3 })).toBeVisible();

  // 3. Offline: unstar it in the picker. The change is local and waits in the outbox.
  await context.setOffline(true);
  await favorites.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true }).click();
  await expect(picker.getByText("Star an exercise to pin it here.")).toBeVisible();
  await expect(favorites.getByRole("heading", { name: LEG_PRESS, level: 3 })).toHaveCount(0);

  // 4. Back online: the tombstone syncs, and the library's Favorites filter no longer lists it.
  await context.setOffline(false);
  await expect.poll(() => dbFavorites(email), { timeout: 90_000, intervals: [1000, 2000, 3000] }).toEqual([{ name: LEG_PRESS, deleted: true }]);
  await page.keyboard.press("Escape");
  await page.goto("/exercises?fav=1");
  await expect(page.getByRole("heading", { name: "No favorites yet" })).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Show all exercises" })).toBeVisible();
});

test("the star works on the exercise detail page and survives a reload (aria-pressed from the server, then the local database)", async ({ page }) => {
  test.setTimeout(240_000);
  await createUser(page, { tag: "favdetail", name: "Fav Detail" });
  await page.goto("/exercises?q=leg+press");
  await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link").filter({ has: page.getByRole("heading", { name: LEG_PRESS, exact: true }) }).first().click(); // the card link wraps the photo, tags and name
  await expect(page.getByRole("heading", { name: LEG_PRESS, level: 1 })).toBeVisible({ timeout: 30_000 });
  const star = page.getByRole("button", { name: `Add ${LEG_PRESS} to favorites`, exact: true });
  await expect(star).toHaveAttribute("aria-pressed", "false");
  await star.click();
  await expect(page.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.sync-pip[data-state="idle"]')).toContainText(/^Synced$/, { timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true })).toHaveAttribute("aria-pressed", "true");
});

// Accessibility: the star has an accessible name and a pressed state, and the screens that carry it have zero axe violations, in both themes.
for (const theme of ["paper", "ink"] as const) {
  test(`axe: the star button (name, pressed state, contrast) on library, detail and picker, ${theme} theme`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
    await createUser(page, { tag: `favaxe${theme}`, name: "Fav Axe" });
    const audit = async (label: string) => {
      await expect(page.locator("html"), `theme attribute on ${label}`).toHaveAttribute("data-theme", `overload-${theme}`);
      await page.waitForTimeout(300); // let entry transitions finish: axe reads mid-fade colours otherwise
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
      expect(
        results.violations.map((v) => ({ screen: label, id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) })),
        `axe on ${label} (${theme})`,
      ).toEqual([]);
    };

    // library: one starred and one unstarred card
    await page.goto("/exercises?q=press");
    await expect(page.locator('.sync-pip[data-state="idle"]')).toBeVisible({ timeout: 60_000 });
    const stars = page.locator(".favorite-button");
    await expect(stars.first()).toBeVisible({ timeout: 60_000 });
    for (const button of await stars.all()) {
      const name = await button.getAttribute("aria-label");
      expect(name, "every star has an accessible name").toMatch(/^(Add .+ to favorites|Remove .+ from favorites)$/);
      expect(["true", "false"]).toContain(await button.getAttribute("aria-pressed"));
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: `Add ${LEG_PRESS} to favorites`, exact: true }).first().click();
    await expect(page.getByRole("button", { name: `Remove ${LEG_PRESS} from favorites`, exact: true }).first()).toHaveAttribute("aria-pressed", "true");
    await audit("/exercises (one starred)");
    await page.getByRole("link", { name: "Favorites" }).click();
    await expect(page).toHaveURL(/fav=1/);
    await audit("/exercises?fav=1");

    // detail
    await page.goto("/exercises?q=leg+press");
    await page.getByRole("link").filter({ has: page.getByRole("heading", { name: LEG_PRESS, exact: true }) }).first().click(); // the card link wraps the photo, tags and name
    await expect(page.getByRole("heading", { name: LEG_PRESS, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /to favorites$|from favorites$/ })).toBeVisible();
    await audit("/exercises/[id]");

    // picker, with a favorite pinned above the list
    const picker = await startWorkoutAndOpenPicker(page);
    await expect(picker.getByRole("region", { name: "Favorite exercises" })).toBeVisible();
    await audit("workout picker");
  });
}
