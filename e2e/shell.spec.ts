// Stream B: app shell, PWA, design system. Needs a database (sign-up) for the shell tests; /styleguide and the marketing page do not.
// Offline / service-worker specs need a production build: PORT=3002 E2E_PROD=1 pnpm exec playwright test e2e/shell.spec.ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type BrowserContext } from "@playwright/test";
import { createUser } from "./_support/user";

const PROD = process.env.E2E_PROD === "1";

// Each worker creates ONE user and the tests share its session (sign-up is rate-limited per IP in production builds).
type WorkerFixtures = { authState: Awaited<ReturnType<BrowserContext["storageState"]>> };
const test = base.extend<object, WorkerFixtures>({
  authState: [
    async ({ browser }, provide) => {
      // Worker fixtures cannot read the test-scoped baseURL: derive it like playwright.config.ts does.
      const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await createUser(page, { tag: "shell", name: "Shell Tester" });
      const state = await context.storageState();
      await context.close();
      await provide(state);
    },
    { scope: "worker", timeout: 120_000 },
  ],
  storageState: async ({ authState }, provide) => {
    await provide(authState);
  },
});

test.describe("shell (signed in)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/\/today$/);
  });

  test("landmarks, skip link and primary navigation", async ({ page, isMobile, browserName }) => {
    await page.goto("/today"); // fresh document: the first Tab stop is the skip link
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator("main#main")).toHaveCount(1);
    const nav = page.getByRole("navigation", { name: isMobile ? "Primary (mobile)" : "Primary" });
    await expect(nav).toBeVisible();

    // Skip link is the first tab stop and moves focus to <main>.
    // (macOS WebKit does not Tab to links unless Safari's "Press Tab to highlight each item" is on, so focus it directly there.)
    if (browserName === "webkit") await page.getByRole("link", { name: "Skip to content" }).focus();
    else await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();

    if (isMobile) {
      await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
      await nav.getByRole("link", { name: "Start workout" }).click();
      await expect(page).toHaveURL(/\/workout$/);
    } else {
      await expect(nav.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
      for (const [label, href] of [
        ["Exercises", "/exercises"],
        ["History", "/history"],
        ["Progress", "/progress"],
        ["Insights", "/insights"],
        ["Settings", "/settings"],
      ] as const) {
        await expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", href);
      }
      await page.getByRole("link", { name: "Start workout" }).click();
      await expect(page).toHaveURL(/\/workout$/);
    }
  });

  test("mobile: the dock sits above the safe area and More reaches the other destinations", async ({ page, isMobile }) => {
    test.skip(!isMobile, "dock is mobile-only");
    const dock = page.getByRole("navigation", { name: "Primary (mobile)" });
    await expect(dock).toBeVisible();
    const box = (await dock.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // The dock's offset is `bottom: calc(env(safe-area-inset-bottom) + .25rem)`; WebKit emulation reports 0 for env(), so assert the rule.
    const rule = await page.evaluate(() =>
      [...document.styleSheets].flatMap((s) => [...s.cssRules]).map((r) => r.cssText).find((t) => t.startsWith(".shell-dock {")) ?? "",
    );
    expect(rule).toContain("safe-area-inset-bottom");
    // Content is never hidden behind it: main pads for the dock.
    const pad = await page.locator("main").evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(pad).toBeGreaterThan(box.height);

    await dock.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    for (const name of ["History", "Insights", "Settings"]) await expect(sheet.getByRole("link", { name })).toBeVisible();
  });

  test("desktop: the frame navbar uses the asymmetric vermilion border and the dock is hidden", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop-only");
    const widths = await page.locator(".shell-frame").evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
    });
    expect(widths).toEqual(["1px", "4px", "8px", "2px"]);
    await expect(page.locator(".shell-dock")).toBeHidden();
  });

  test("SyncPip renders and reflects offline", async ({ page, context }) => {
    const pip = page.locator(".shell-tools .sync-pip");
    await expect(pip).toBeVisible();
    // The first sync of a fresh account pulls the catalog and a push round-trips the database: allow more than the default 5 s.
    await expect(pip).toContainText("Synced", { timeout: 20_000 });
    await context.setOffline(true);
    await expect(pip).toContainText("Offline");
    await context.setOffline(false);
    await expect(pip).toContainText("Synced", { timeout: 20_000 });
  });

  test("theme toggle persists across reloads", async ({ page, isMobile }) => {
    if (isMobile) {
      await page.getByRole("navigation", { name: "Primary (mobile)" }).getByRole("button", { name: "More" }).click();
    }
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");
    const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ }).filter({ visible: true });
    await toggle.click();
    const after = await html.getAttribute("data-theme");
    expect(after).not.toBe(before);
    expect(["overload-paper", "overload-ink"]).toContain(after);
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after!);
    expect(await page.evaluate(() => localStorage.getItem("overload-theme"))).toBe(after === "overload-ink" ? "ink" : "paper");
  });

  test("iOS Safari: the Add to Home Screen hint shows once and stays dismissed", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "the hint targets iOS Safari");
    const hint = page.getByRole("complementary", { name: "Install Overload" });
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Dismiss install hint" }).click();
    await expect(hint).toBeHidden();
    await page.reload();
    await expect(hint).toBeHidden();
  });

  test("offline: an uncached page falls back to /~offline (production build)", async ({ page, context, browserName }) => {
    test.skip(!PROD, "service worker is disabled in `next dev`: run with E2E_PROD=1");
    test.skip(browserName === "webkit", "Playwright WebKit does not intercept service-worker fallbacks reliably; covered in chromium");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // The worker claims clients on activation; wait until it controls this page.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 30_000 });
    await context.setOffline(true);
    await page.goto("/never-visited-page").catch(() => {});
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe("public pages", () => {
  test("landing page: portfolio look, honest copy, landmarks", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create account" }).first()).toBeVisible();
    expect(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily)).toContain("Newsreader");
    await expect(page.locator(".shell-backdrop")).toHaveCount(1);
  });

  test("manifest is installable-shaped and the offline page is static", async ({ request, page }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ display: "standalone", start_url: "/today", name: "Overload" });
    expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(expect.arrayContaining(["any", "maskable"]));
    for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
    await page.goto("/~offline");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
  });
});

test.describe("axe: /styleguide (every primitive and UI component)", () => {
  for (const theme of ["paper", "ink"] as const) {
    test(`no violations in the ${theme} theme`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("overload-theme", t), theme);
      await page.goto("/styleguide");
      await expect(page.locator("html")).toHaveAttribute("data-theme", `overload-${theme}`);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
      expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }))).toEqual([]);
    });
  }

  test("open sheet and toasts have no violations", async ({ page }) => {
    await page.goto("/styleguide");
    const surface = page.locator('.sg-surface[data-theme="overload-paper"]');
    await surface.getByRole("button", { name: "Open sheet" }).click();
    await expect(page.getByRole("dialog", { name: "Rest timer" })).toBeVisible();
    await page.waitForTimeout(400); // let the open transition finish before measuring contrast
    const results = await new AxeBuilder({ page }).include("dialog").analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Rest timer" })).toBeHidden();
    await surface.getByRole("button", { name: "PR toast" }).click();
    await expect(page.getByRole("status").filter({ hasText: "New PR" })).toBeVisible();
    await page.waitForTimeout(500); // let the toast's entry animation finish (axe reads mid-fade colours otherwise)
    const toastResults = await new AxeBuilder({ page }).include(".toast-region").analyze();
    expect(toastResults.violations).toEqual([]);
  });
});
