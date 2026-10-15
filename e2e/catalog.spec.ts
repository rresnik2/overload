// Stream C: exercise library, detail page and GET /api/catalog. Needs a seeded database (pnpm db:deploy && pnpm db:seed).
// Test credentials are generated per run for the local dev database only.
import { expect, test, type Page } from "@playwright/test";
import { createUser } from "./_support/user";

// Account setup (sign-up, verification, onboarding) plus many navigations; `next dev` compiles routes on first hit and WebKit is the slowest.
test.describe.configure({ timeout: 90_000 });

const cards = (page: Page) => page.locator("article.exercise-card");
const badges = (page: Page) => page.locator("article.exercise-card .modality-badge");

/** The list re-renders after the URL changes: poll until every card on it has the wanted modality (and there is at least one). */
const expectModalities = (page: Page, modality: string) =>
  expect
    .poll(async () => [...new Set(await badges(page).evaluateAll((els) => els.map((el) => el.getAttribute("data-modality"))))])
    .toEqual([modality]);

test("the catalog API needs a session, then answers 200 with an ETag and 304 for If-None-Match", async ({ page, request }) => {
  const anonymous = await request.get("/api/catalog");
  expect(anonymous.status()).toBe(401);

  await createUser(page, { tag: "catalog" });
  const first = await page.request.get("/api/catalog", { maxRetries: 3 }); // retries a keep-alive socket the server closed (ECONNRESET)
  expect(first.status()).toBe(200);
  const etag = first.headers().etag;
  expect(etag).toMatch(/^W\/"catalog-\d+"$/);
  expect(first.headers()["cache-control"]).toBe("private, max-age=0, must-revalidate");
  const body = await first.json();
  expect(body.exercises).toHaveLength(876);
  expect(body.version).toBe(Number(etag.match(/\d+/)![0]));
  const squat = body.exercises.find((e: { sourceId: string }) => e.sourceId === "Barbell_Squat");
  expect(squat).toMatchObject({ modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL", standardLift: "SQUAT", isCustom: false, version: 0, hlc: "" });
  const legPress = body.exercises.find((e: { sourceId: string }) => e.sourceId === "Leg_Press");
  expect(legPress).toMatchObject({ modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" });

  const second = await page.request.get("/api/catalog", { headers: { "If-None-Match": etag } });
  expect(second.status()).toBe(304);
  expect(second.headers().etag).toBe(etag);
  expect(await second.text()).toBe("");
});

test("browse the library: tabs, equipment and muscle filters, search, detail page", async ({ page }) => {
  await createUser(page, { tag: "catalog" });

  await page.goto("/exercises");
  await expect(page.getByRole("heading", { level: 1, name: "Exercises" })).toBeVisible();
  await expect(page.locator(".library-count")).toHaveText("876 exercises");
  const tabs = page.getByRole("navigation", { name: "Exercise type" });
  await expect(tabs.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");

  // Machine tab: only machines, never a free weight.
  await tabs.getByRole("link", { name: /^Machine/ }).click();
  await expect(page).toHaveURL(/modality=machine/);
  await expect(tabs.getByRole("link", { name: /^Machine/ })).toHaveAttribute("aria-current", "page");
  await expectModalities(page, "MACHINE");

  // Free weight tab: no machines or cables.
  await tabs.getByRole("link", { name: /^Free weight/ }).click();
  await expect(page).toHaveURL(/modality=free-weight/);
  await expectModalities(page, "FREE_WEIGHT");

  // Equipment filter inside the tab.
  await page.locator('select[name="equipment"]').selectOption("dumbbell");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/equipment=dumbbell/);
  await expect
    .poll(async () => {
      const texts = await badges(page).allInnerTexts();
      return texts.length > 0 && texts.every((t) => t.toLowerCase().includes("dumbbell"));
    })
    .toBe(true);

  // Muscle filter + search.
  await page.locator('select[name="muscle"]').selectOption("biceps");
  await page.locator('input[name="q"]').fill("curl");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/muscle=biceps/);
  await expect(page).toHaveURL(/q=curl/);
  await expect
    .poll(async () => {
      const names = await cards(page).locator(".exercise-card__name").allInnerTexts();
      return names.length > 0 && names.every((name) => name.toLowerCase().includes("curl"));
    })
    .toBe(true);

  // Clear returns to the tab without filters.
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/exercises\?modality=free-weight$/);

  // Search across everything, open a detail page.
  await page.goto("/exercises?q=leg%20press");
  const legPress = cards(page).filter({ has: page.getByRole("heading", { name: "Leg Press", exact: true }) });
  await expect(legPress).toBeVisible();
  await legPress.getByRole("link").click();
  await expect(page).toHaveURL(/\/exercises\/[0-9a-f-]{36}$/, { timeout: 30_000 }); // `next dev` compiles the detail route on first hit
  await expect(page.getByRole("heading", { level: 1, name: "Leg Press" })).toBeVisible();
  await expect(page.locator(".meta-line")).toHaveText(/Machine\s*\/\s*Plate-loaded machine/);
  await expect(page.getByText("Plates per side").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /How to do it/ })).toBeVisible();
  await expect(page.getByText("You have not logged this exercise yet.")).toBeVisible();
  await expect(page.getByText(/never converted to free-weight numbers/)).toBeVisible();

  // An unknown exercise is a 404, not a crash.
  const missing = await page.goto("/exercises/00000000-0000-4000-8000-000000000000");
  expect(missing?.status()).toBe(404);
});

test("the library works without JavaScript (URL-driven)", async ({ page, browser }) => {
  await createUser(page, { tag: "catalog" });
  const state = await page.context().storageState();
  const context = await browser.newContext({ storageState: state, javaScriptEnabled: false });
  const plain = await context.newPage();
  await plain.goto("/exercises?modality=cable&q=pulldown");
  await expect(plain.getByRole("heading", { level: 1, name: "Exercises" })).toBeVisible();
  expect(await cards(plain).count()).toBeGreaterThan(0);
  for (const text of await cards(plain).locator(".exercise-card__name").allInnerTexts()) expect(text.toLowerCase()).toContain("pulldown");
  await plain.locator('input[name="q"]').fill("row");
  await plain.getByRole("button", { name: "Apply" }).click();
  await expect(plain).toHaveURL(/modality=cable/);
  await expect(plain).toHaveURL(/q=row/);
  await context.close();
});
