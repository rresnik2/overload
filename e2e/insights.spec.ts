// Stream G: /insights and /learn.
// The model is mocked at the SDK boundary: the SERVER must run with INSIGHTS_E2E_FAKE=1 (src/server/insights/client.ts swaps in an
// offline stand-in that writes a grounded narrative from the facts it receives). Playwright's own web server inherits it from the shell:
//   INSIGHTS_E2E_FAKE=1 PORT=3003 pnpm exec playwright test e2e/insights.spec.ts --project=chromium
// (E2E_PROD=1 works the same). Against a server without the flag the tests that would call the model are SKIPPED, never run for real.
// Each user gets a 6-week generated lifting history (the same generator the demo-user seed uses), written straight to the database.

import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type Browser, type BrowserContext } from "@playwright/test";
import { insightFactsSchema } from "@/contracts/insights";
import { SOURCES } from "@/components/learn/sources";
import { ARTICLES } from "@/components/learn/articles";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import { estimate1RM } from "@/lib/analytics/e1rm";
import { effectiveLoadKg } from "@/lib/analytics/load";
import { addDays, isoWeekStart, localDateToDate, toLocalDate } from "@/lib/dates";
import { generateLifterRows } from "@/lib/fixtures/generate";
import { newId, seriesKey } from "@/lib/ids";
import type { prisma } from "@/server/db";
import { fakeNarrativeFor } from "@/server/insights/fake-client";
import { createUser } from "./_support/user";

const TIMEZONE = "America/Chicago"; // what createUser's onboarding picks

type Db = typeof prisma;
let dbPromise: Promise<Db> | undefined;
/** The worktree's own database, from .env.local (Playwright does not load it; only the database settings are taken). */
function db(): Promise<Db> {
  dbPromise ??= (async () => {
    const before = new Set(Object.keys(process.env));
    try {
      process.loadEnvFile(".env.local");
    } catch {
      /* CI provides DATABASE_URL */
    }
    for (const key of Object.keys(process.env)) if (!before.has(key) && !/^DATABASE_(URL|POOL_MAX)$/.test(key)) delete process.env[key];
    return (await import("@/server/db")).prisma;
  })();
  return dbPromise;
}

/** Six weeks of generated history for `email`, ending today (Chicago), as real rows. */
async function seedHistory(email: string): Promise<{ userId: string; weekStart: string }> {
  const prisma = await db();
  const user = await prisma.user.findFirstOrThrow({ where: { email } });
  const today = toLocalDate(new Date(), TIMEZONE);
  const rows = generateLifterRows({ today, weeks: 6, userKey: `e2e-${newId()}` });
  const toNum = (n: number | null) => n;
  const sync = { hlc: "", version: 0 };

  await prisma.machineProfile.createMany({
    data: rows.machineProfiles.map((m) => ({ id: m.id, userId: user.id, name: m.name, gymName: m.gymName, brand: m.brand, exerciseId: m.exerciseId, labelUnit: m.labelUnit, pinStepKg: m.pinStepKg, baseLoadKg: m.baseLoadKg, notes: m.notes, ...sync })),
  });
  await prisma.workout.createMany({
    data: rows.workouts.map((w) => ({ id: w.id, userId: user.id, title: w.title, startedAt: new Date(w.startedAt), endedAt: new Date(w.endedAt), localDate: localDateToDate(w.localDate), timezone: w.timezone, bodyweightKg: w.bodyweightKg, isDeload: w.isDeload, ...sync })),
  });
  await prisma.workoutExercise.createMany({
    data: rows.workouts.flatMap((w) => w.exercises.map((we, i) => ({ id: we.id, userId: user.id, workoutId: w.id, exerciseId: we.exerciseId, machineProfileId: we.machineProfileId, position: `a${i}`, ...sync }))),
  });
  const meta = new Map(rows.exercises.map((e) => [e.id, e]));
  const machines = new Map(rows.machineProfiles.map((m) => [m.id, m]));
  await prisma.workoutSet.createMany({
    data: rows.workouts.flatMap((w) =>
      w.exercises.flatMap((we) =>
        we.sets.map((s, i) => {
          const ex = meta.get(we.exerciseId)!;
          const eff = effectiveLoadKg({ loadType: ex.loadType, weightKg: s.weightKg, isUnilateral: ex.isUnilateral, bodyweightKg: w.bodyweightKg, bodyweightFactor: ex.bodyweightFactor, baseLoadKg: we.machineProfileId ? machines.get(we.machineProfileId)?.baseLoadKg ?? null : null });
          const e1rm = eff != null ? estimate1RM({ weightKg: eff, reps: s.reps, rir: s.rir })?.e1rmKg ?? null : null;
          return {
            id: s.id, userId: user.id, workoutExerciseId: we.id, workoutId: w.id, exerciseId: we.exerciseId, machineProfileId: we.machineProfileId,
            seriesKey: seriesKey(we.exerciseId, we.machineProfileId), localDate: localDateToDate(w.localDate), effectiveLoadKg: toNum(eff), e1rmKg: e1rm,
            position: `a${i}`, setType: s.setType, weightKg: s.weightKg, inputUnit: s.inputUnit, reps: s.reps, rir: s.rir, completedAt: new Date(s.completedAt), ...sync,
          };
        }),
      ),
    ),
  });
  return { userId: user.id, weekStart: addDays(isoWeekStart(today), -7) };
}

/** A stored report for an earlier week (facts from the generator, narrative from the same fake the server uses). */
async function seedReport(userId: string, weekStart: string, today: string, withNarrative: boolean) {
  const prisma = await db();
  const rows = generateLifterRows({ today, weeks: 6, userKey: `hist-${newId()}` });
  const facts = insightFactsSchema.parse(buildWeeklyFacts(rows.input, { weekStart }));
  await prisma.insightReport.create({
    data: {
      userId, weekStart: localDateToDate(weekStart), status: "READY", trigger: "CRON", factsVersion: 1, facts: facts as never,
      factsHash: `seeded-${weekStart}`, ...(withNarrative ? { narrative: fakeNarrativeFor(facts) as never } : {}),
      model: "seeded", promptVersion: "seeded", inputTokens: 1, outputTokens: 1, generatedAt: new Date(),
    },
  });
}

async function signedInContext(browser: Browser, tag: string): Promise<{ context: BrowserContext; email: string }> {
  const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const { email } = await createUser(page, { tag, name: "Insights Tester" });
  await page.close();
  return { context, email };
}

type Seeded = { userId: string; weekStart: string; email: string };
type WorkerFixtures = { reader: Seeded & { state: Awaited<ReturnType<BrowserContext["storageState"]>> } };
type TestFixtures = { writer: Seeded };

const test = base.extend<TestFixtures, WorkerFixtures>({
  // One signed-in user per worker for the read-only tests (sign-up is rate-limited per IP on production builds).
  reader: [
    async ({ browser }, provide) => {
      const { context, email } = await signedInContext(browser, "insights-read");
      const state = await context.storageState();
      await context.close();
      await provide({ ...(await seedHistory(email)), email, state });
    },
    { scope: "worker", timeout: 120_000 },
  ],
  // A fresh user per test for the tests that generate or store reports.
  writer: async ({ browser, page }, provide) => {
    const { context, email } = await signedInContext(browser, "insights-write");
    const state = await context.storageState();
    await context.close();
    await page.context().addCookies(state.cookies);
    await provide({ ...(await seedHistory(email)), email });
  },
});

test.describe("/insights", () => {
  test.setTimeout(120_000);

  test("signed-out visitors are sent to sign in", async ({ page }) => {
    await page.goto("/insights");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("rules-only cards render with no report, and expand to evidence and source links", async ({ browser, reader }) => {
    const context = await browser.newContext({ storageState: reader.state });
    const page = await context.newPage();
    await page.goto("/insights");
    await expect(page.getByRole("heading", { level: 1, name: "Insights" })).toBeVisible();
    await expect(page.getByText("No written review yet for this week")).toBeVisible();
    await expect(page.getByTestId("regenerations-left")).toHaveText("3 of 3 regenerations left this week");

    const cards = page.locator("details.insight-card");
    expect(await cards.count()).toBeGreaterThan(0);
    const first = cards.first();
    await expect(first.locator(".insight-card__body")).toBeHidden();
    await first.locator("summary").click();
    await expect(first.locator(".insight-card__body")).toBeVisible();
    await expect(first.getByRole("list", { name: /./ }).or(first.locator("dl"))).not.toHaveCount(0);

    // Some card cites a source: its link is external, opens in a new tab and points at a registered citation.
    const links = page.locator("details.insight-card .insight-card__sources a");
    await page.locator("details.insight-card summary").evaluateAll((els) => els.forEach((el) => ((el.parentElement as HTMLDetailsElement).open = true)));
    expect(await links.count()).toBeGreaterThan(0);
    for (const a of await links.all()) {
      await expect(a).toHaveAttribute("href", /^https:\/\//);
      await expect(a).toHaveAttribute("target", "_blank");
      await expect(a).toHaveAttribute("rel", /noopener/);
    }
    await context.close();
  });

  test("generate writes the narrative; regenerating with unchanged facts uses no regeneration", async ({ page, request, writer }) => {
    const probe = await request.get("/api/cron/insights");
    test.skip(probe.headers()["x-insights-fake-model"] !== "1", "server is not running the fake model: start it with INSIGHTS_E2E_FAKE=1");
    await page.goto("/insights");
    await expect(page.getByTestId("regenerations-left")).toHaveText("3 of 3 regenerations left this week");
    await page.getByRole("button", { name: "Write this week's review" }).click();

    // The fake model's narrative: grounded in this user's facts, shown above the rule cards.
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^Week of ${writer.weekStart} in review$`) })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Review updated.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Next week" })).toBeVisible();
    await expect(page.locator("details.insight-card").first()).toBeVisible(); // the rule cards stay
    await expect(page.getByTestId("regenerations-left")).toHaveText("2 of 3 regenerations left this week");

    await page.getByRole("button", { name: "Regenerate review" }).click();
    await expect(page.getByText(/Nothing has changed since the last review/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("regenerations-left")).toHaveText("2 of 3 regenerations left this week");
  });

  test("a stored narrative renders, with history and a detail page for earlier weeks", async ({ page, writer }) => {
    const today = toLocalDate(new Date(), TIMEZONE);
    const earlier = addDays(writer.weekStart, -7);
    await seedReport(writer.userId, earlier, today, true);
    await seedReport(writer.userId, writer.weekStart, today, true);

    await page.goto("/insights");
    await expect(page.getByRole("heading", { level: 2, name: `Week of ${writer.weekStart} in review` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Earlier weeks" })).toBeVisible();
    await page.getByRole("link", { name: /Week of .* in review/ }).click();
    await expect(page).toHaveURL(new RegExp(`/insights/${earlier}$`));
    await expect(page.getByRole("heading", { level: 2, name: `Week of ${earlier} in review` })).toBeVisible();
    await expect(page.locator("details.insight-card").first()).toBeVisible();

    const missing = await page.goto("/insights/2001-01-01");
    expect(missing?.status()).toBe(404);
  });

  test("a failed generation still shows the rule cards", async ({ page, writer }) => {
    const prisma = await db();
    const today = toLocalDate(new Date(), TIMEZONE);
    await seedReport(writer.userId, writer.weekStart, today, false);
    await prisma.insightReport.updateMany({ where: { userId: writer.userId }, data: { status: "FAILED", error: "Narrative rejected: test" } });
    await page.goto("/insights");
    await expect(page.getByText(/could not be generated this time/)).toBeVisible();
    await expect(page.locator("details.insight-card").first()).toBeVisible();
  });

  test("has no automatically detectable accessibility violations", async ({ browser, reader }) => {
    const context = await browser.newContext({ storageState: reader.state });
    const page = await context.newPage();
    await page.goto("/insights");
    await expect(page.getByRole("heading", { level: 1, name: "Insights" })).toBeVisible();
    await page.locator("details.insight-card summary").first().click();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    await context.close();
  });
});

test.describe("/api/cron/insights", () => {
  test("answers 401 without the secret", async ({ request }) => {
    expect((await request.get("/api/cron/insights")).status()).toBe(401);
    expect((await request.get("/api/cron/insights", { headers: { authorization: "Bearer not-the-secret" } })).status()).toBe(401);
  });
});

test.describe("/learn", () => {
  test("lists the five articles", async ({ page }) => {
    await page.goto("/learn");
    await expect(page.getByRole("heading", { level: 1, name: "Learn" })).toBeVisible();
    for (const a of ARTICLES) await expect(page.getByRole("heading", { level: 2, name: a.title })).toBeVisible();
    expect(ARTICLES.map((a) => a.slug)).toEqual(["hypertrophy-vs-hyperplasia", "e1rm", "rir", "volume-landmarks", "machine-vs-free-weight"]);
  });

  for (const article of ARTICLES) {
    test(`${article.slug}: renders with working, registered citation links`, async ({ page }) => {
      await page.goto(`/learn/${article.slug}`);
      await expect(page.getByRole("heading", { level: 1, name: article.title })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Sources" })).toBeVisible();
      const registered = new Set(Object.values(SOURCES).map((s) => s.url));
      const external = page.locator("main a[href^='http']");
      expect(await external.count()).toBeGreaterThan(0);
      for (const a of await external.all()) {
        const href = (await a.getAttribute("href"))!;
        expect(registered.has(href), `${href} is not in the verified source list`).toBe(true);
        await expect(a).toHaveAttribute("target", "_blank");
        await expect(a).toHaveAttribute("rel", /noopener/);
      }
      // Every inline citation also appears in the Sources list at the bottom.
      const inline = new Set(await page.locator("a.learn__cite").evaluateAll((els) => els.map((e) => e.getAttribute("data-source"))));
      const listed = new Set(await page.locator(".learn__sources a").evaluateAll((els) => els.map((e) => e.getAttribute("data-source"))));
      for (const id of inline) expect(listed.has(id), `${id} cited but not listed`).toBe(true);
    });
  }

  test("the hyperplasia article says the evidence is unresolved and likely minor, keeps [Contested], and offers no mode", async ({ page }) => {
    await page.goto("/learn/hypertrophy-vs-hyperplasia");
    await expect(page.getByText("Muscles grow mainly because fibers get larger; whether adults gain new fibers is unresolved and likely minor. Training well for size covers it.")).toBeVisible();
    expect(await page.getByText("[Contested]").count()).toBeGreaterThanOrEqual(2);
    await expect(page.getByText(/does not have a hyperplasia mode/)).toBeVisible();
  });

  test("a learn page has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto("/learn/volume-landmarks");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});
