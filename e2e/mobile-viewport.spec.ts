// Android viewport and scroll (DIAL fix A1). Chrome on Android (viewport-fit=cover, edge-to-edge) used to leave the last strip of
// every page under the gesture bar or the dock, and cut /sign-in off under the keyboard. Playwright cannot animate
// env(safe-area-inset-bottom) or open a real keyboard, so this spec pins the layout rules that keep those fixes honest:
//   - at phone sizes the last interactive element of each main page scrolls fully above the dock / rest bar and takes a click;
//   - /sign-in stays reachable (nothing cut off above, nothing unreachable below) when the viewport shrinks to ~55% for a keyboard;
//   - nothing overflows sideways at 360px.
// Run against a production build on each project:
//   PORT=3001 E2E_PROD=1 pnpm exec playwright test e2e/mobile-viewport.spec.ts --project=android-chrome
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { createUser } from "./_support/user";

type WorkerFixtures = { authState: Awaited<ReturnType<BrowserContext["storageState"]>> };
const test = base.extend<object, WorkerFixtures>({
  authState: [
    async ({ browser }, provide) => {
      const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await createUser(page, { tag: "viewport", name: "Viewport Tester" });
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

test.describe.configure({ timeout: 180_000 });

const SIZES = [
  { width: 360, height: 640 },
  { width: 412, height: 915 },
] as const;
const COLD = { timeout: 60_000 };

/**
 * Marks the last interactive element in document order that a thumb could reach: visible, not in a fixed bar (dock, toasts) or a
 * fixed ancestor, not visually hidden (the dial's range input), not disabled. Returns a locator for it plus the y of the highest
 * fixed bottom bar (the dock, the rest timer) or the viewport height when there is none.
 */
async function markLastInteractive(page: Page) {
  const info = await page.evaluate(() => {
    document.querySelectorAll("[data-e2e-last]").forEach((el) => el.removeAttribute("data-e2e-last"));
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])'),
    ];
    const reachable = (el: HTMLElement) => {
      if ((el as HTMLButtonElement).disabled || el.hasAttribute("inert") || el.closest("[inert], [hidden], .sr-only, .toast-region, .shell-dock, .skip-link")) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return false;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || style.pointerEvents === "none") return false;
      for (let node: HTMLElement | null = el; node; node = node.parentElement) if (getComputedStyle(node).position === "fixed") return false;
      return true;
    };
    const last = candidates.filter(reachable).at(-1);
    if (!last) return null;
    last.setAttribute("data-e2e-last", "");
    const barTops = [...document.querySelectorAll<HTMLElement>(".shell-dock, .wk-rest")]
      .filter((bar) => getComputedStyle(bar).position === "fixed" && bar.getBoundingClientRect().height > 0)
      .map((bar) => bar.getBoundingClientRect().top);
    return { label: (last.getAttribute("aria-label") ?? last.textContent ?? last.tagName).trim().slice(0, 40), limit: Math.min(window.innerHeight, ...barTops) };
  });
  expect(info, "page has an interactive element").not.toBeNull();
  return { ...info!, locator: page.locator("[data-e2e-last]") };
}

/** Scroll the way a thumb does (to the very bottom), then assert the last control is fully above the bottom bar and takes a click. */
async function expectLastControlReachable(page: Page, where: string) {
  const { locator, limit, label } = await markLastInteractive(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const box = (await locator.boundingBox())!;
  expect(box.y + box.height, `${where}: "${label}" ends at ${Math.round(box.y + box.height)}px, the bar or viewport edge is at ${Math.round(limit)}px`).toBeLessThanOrEqual(limit + 0.5);
  expect(box.y, `${where}: "${label}" is not cut off above`).toBeGreaterThanOrEqual(0);
  await locator.click({ trial: true, timeout: 5_000 }); // actionability only: visible, stable, and nothing covers its centre
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  const over = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(over.doc, `${where}: documentElement overflows sideways`).toBeLessThanOrEqual(0);
  expect(over.body, `${where}: body overflows sideways`).toBeLessThanOrEqual(0);
}

async function settle(page: Page) {
  await expect(page.locator("main").first()).toBeVisible(COLD);
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
}

const PAGES = ["/today", "/exercises", "/progress", "/settings/profile"] as const;

test.describe("app pages at phone sizes", () => {
  for (const path of PAGES) {
    test(`${path}: the last control scrolls above the dock; no sideways scroll`, async ({ page }) => {
      for (const size of SIZES) {
        await page.setViewportSize(size);
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible(COLD);
        await settle(page);
        const where = `${path} at ${size.width}x${size.height}`;
        await expect(page.locator(".shell-dock")).toBeVisible();
        await expectLastControlReachable(page, where);
        if (size.width === 360) await expectNoSidewaysScroll(page, where);
      }
    });
  }

  test("/workout: with an exercise open, the panel's last control clears the rest bar and the page scrolls", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/workout");
    const start = page.getByRole("button", { name: "Start empty workout" });
    const name = page.getByRole("textbox", { name: "Workout name" });
    await expect(start.or(name)).toBeVisible(COLD);
    if (await start.isVisible()) await start.click();
    await expect(name).toBeVisible(COLD);

    await page.getByRole("button", { name: "Add exercise" }).first().click();
    const picker = page.getByRole("dialog");
    await expect(picker.locator(".exercise-card").first()).toBeVisible({ timeout: 90_000 }); // the catalog has synced into Dexie
    await picker.getByPlaceholder("Search exercises").fill("barbell bench press");
    await picker.getByRole("button", { name: "Add Barbell Bench Press - Medium Grip", exact: true }).first().click();
    await expect(page.getByRole("region", { name: "Barbell Bench Press - Medium Grip" })).toBeVisible(COLD);
    await expect(picker).toBeHidden();

    // Vertical swipes must reach the page: only the dial's circle (touch-action: none) and the strip's x axis are captured.
    await page.locator(".dial__face").first().scrollIntoViewIfNeeded();
    const gestures = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(".numstrip__scroller");
      const face = document.querySelector<HTMLElement>(".dial__face");
      const r = face?.getBoundingClientRect();
      // Just inside the face's square, outside its circle: the hit target must not be the face or its svg.
      const corner = r ? document.elementFromPoint(r.left + r.width * 0.03, r.top + r.height * 0.03) : null;
      return {
        stripY: scroller ? getComputedStyle(scroller).overscrollBehaviorY : null,
        stripX: scroller ? getComputedStyle(scroller).overscrollBehaviorX : null,
        faceTouch: face ? getComputedStyle(face).touchAction : null,
        cornerOnFace: corner ? Boolean(corner.closest(".dial__face")) : null,
      };
    });
    expect(gestures.stripY, "numstrip must not swallow vertical overscroll").toBe("auto");
    expect(gestures.stripX).toBe("contain");
    expect(gestures.faceTouch).toBe("none");
    expect(gestures.cornerOnFace, "the dial's no-scroll area is the circle, not its square").toBe(false);

    for (const size of SIZES) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250);
      const where = `/workout at ${size.width}x${size.height}`;
      // The set panel is on screen (not the desktop row) at phone widths.
      await expect(page.getByRole("button", { name: /^Log set/ }).first()).toBeVisible();
      await expectLastControlReachable(page, where);
      if (size.width === 360) await expectNoSidewaysScroll(page, where);
    }
  });
});

test.describe("sign-in", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const size of SIZES) {
    test(`/sign-in at ${size.width}x${size.height}: reachable normally and with the keyboard up`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto("/sign-in");
      const email = page.getByLabel("Email");
      const password = page.getByLabel("Password");
      const submit = page.getByRole("button", { name: "Sign in", exact: true });
      await expect(email).toBeVisible(COLD);
      const where = `/sign-in at ${size.width}x${size.height}`;
      if (size.width === 360) await expectNoSidewaysScroll(page, where);
      await expectLastControlReachable(page, where);

      // A keyboard takes about 45% of the height (interactive-widget=resizes-content shrinks the layout viewport like this).
      const withKeyboard = { width: size.width, height: Math.round(size.height * 0.55) };
      await page.setViewportSize(withKeyboard);
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, 0));
      // Nothing is cut off above (justify-content: safe center) ...
      const topOfPage = await page.evaluate(() => document.querySelector(".auth-page")?.firstElementChild?.getBoundingClientRect().top ?? 0);
      expect(topOfPage, `${where} with keyboard: the top of the page is not scrolled out of reach`).toBeGreaterThanOrEqual(0);
      // ... and every field and the submit button can be scrolled to and used.
      for (const [label, target] of [["email", email], ["password", password], ["submit", submit]] as const) {
        await target.scrollIntoViewIfNeeded();
        const box = (await target.boundingBox())!;
        expect(box.y, `${where} with keyboard: ${label} not cut off above`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `${where} with keyboard: ${label} not cut off below`).toBeLessThanOrEqual(withKeyboard.height + 0.5);
        await target.click({ trial: true, timeout: 5_000 });
      }
      // Playwright cannot open a real keyboard with Chrome's old "resizes-visual" behaviour, so pin the rules that make the page
      // scrollable above one: the opt-in meta, a short-viewport-safe layout, and a centring that never clips the top.
      const rules = await page.evaluate(() => {
        const cs = getComputedStyle(document.querySelector(".auth-page")!);
        return {
          widget: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "",
          justify: cs.justifyContent,
          minHeight: parseFloat(cs.minHeight),
          innerHeight: window.innerHeight,
        };
      });
      expect(rules.widget).toContain("interactive-widget=resizes-content");
      expect(rules.justify, "short viewports start at the top").toBe("flex-start"); // height <= 700px here
      expect(rules.minHeight).toBeLessThanOrEqual(rules.innerHeight);
      await page.setViewportSize({ width: size.width, height: 915 });
      const tall = await page.evaluate(() => getComputedStyle(document.querySelector(".auth-page")!).justifyContent);
      expect(tall, "tall viewports centre safely").toBe("safe center");
      await page.setViewportSize(withKeyboard);

      await email.focus();
      await page.waitForTimeout(450); // the focus handler centres the field after the keyboard has resized the layout
      const focused = (await email.boundingBox())!;
      expect(focused.y).toBeGreaterThanOrEqual(0);
      expect(focused.y + focused.height).toBeLessThanOrEqual(withKeyboard.height + 0.5);
      await expectLastControlReachable(page, `${where} with keyboard`);
    });
  }
});
