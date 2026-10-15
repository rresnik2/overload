// Console budget (stream W3): no console errors, page errors or failed same-origin requests on any key screen, in either engine, and the
// chosen theme survives hydration. A server/client hydration mismatch makes React re-render the whole document, which logs an error and
// strips attributes (the theme) from <html>: this caught the time-zone datalist, whose option list differs between Node and WebKit.
import { expect, test, type Page } from "@playwright/test";
import { resetRateLimitsIfProduction } from "../_support/user";

test.describe.configure({ timeout: 180_000 });

const DEMO_EMAIL = "demo@overload.test";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "overload-demo-only-2026";
const SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";
const origin = () => new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).origin;

async function signInDemo(page: Page) {
  await resetRateLimitsIfProduction(page);
  for (let attempt = 0; ; attempt++) {
    const res = await page.request.post("/api/auth/sign-in/email", { headers: { origin: origin() }, data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    if (res.ok()) return;
    if (attempt >= 3) throw new Error(`demo sign-in failed (${res.status()}): is the demo user seeded? Run: pnpm exec tsx prisma/seed/fixtures.ts`);
    await resetRateLimitsIfProduction(page);
  }
}

test("key screens log no console errors and keep the chosen theme through hydration", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error on ${new URL(page.url()).pathname}: ${m.text().slice(0, 240)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror on ${new URL(page.url()).pathname}: ${e.message.slice(0, 240)}`));
  page.on("response", (r) => {
    const url = new URL(r.url());
    if (url.origin === origin() && r.status() >= 400 && !/\/api\/(auth\/(get-session|sign-in)|sync)|favicon/.test(url.pathname) && !r.url().includes("_next/image")) {
      problems.push(`HTTP ${r.status()} ${url.pathname}`);
    }
  });
  await page.addInitScript(() => localStorage.setItem("overload-theme", "paper"));

  for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password", "/learn"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("html"), `theme on ${path}`).toHaveAttribute("data-theme", "overload-paper");
  }

  await signInDemo(page);
  for (const path of ["/today", "/exercises", `/exercises/${SQUAT}`, "/exercises/new", "/history", "/templates", "/workout", "/progress", `/progress/${SQUAT}`, "/progress/body", "/progress/prs", "/insights", "/settings/profile", "/settings/machines", "/settings/security", "/settings/account"]) {
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await expect(page.locator("html"), `theme on ${path}`).toHaveAttribute("data-theme", "overload-paper");
  }
  expect(problems).toEqual([]);
});
