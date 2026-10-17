// Needs a migrated + catalog-seeded database (pnpm db:deploy && pnpm db:seed). Run: pnpm test:integration
import { afterAll, describe, expect, it } from "vitest";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import { runInsightRules } from "@/lib/analytics/insights/rules";
import { FIXTURE_TODAY, generateLifterRows } from "@/lib/fixtures/generate";
import { insightFactsSchema } from "@/contracts/insights";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadAnalyticsInput } from "@/server/queries/facts";
import { DEMO_EMAIL, seedDemoUser } from "./fixtures";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("demo user seed (real Postgres)", () => {
  it("is idempotent and round-trips through loadAnalyticsInput -> rules -> weekly facts", async () => {
    const first = await seedDemoUser(prisma, { today: FIXTURE_TODAY });
    const second = await seedDemoUser(prisma, { today: FIXTURE_TODAY });
    expect(second.userId).toBe(first.userId);
    expect(second.sets).toBe(first.sets);

    const rowCount = await prisma.workoutSet.count({ where: { userId: first.userId } });
    expect(rowCount).toBe(first.sets);
    expect(await prisma.user.count({ where: { email: DEMO_EMAIL } })).toBe(1);

    // every row carries a unique, positive sync version
    const versions = await prisma.workoutSet.findMany({ where: { userId: first.userId }, select: { version: true } });
    expect(new Set(versions.map((v) => v.version)).size).toBe(versions.length);
    const state = await prisma.syncState.findUnique({ where: { userId: first.userId } });
    expect(state!.version).toBeGreaterThanOrEqual(Math.max(...versions.map((v) => v.version)));

    // personal records are rebuilt for every series the history touches, and a re-run does not duplicate them
    const seriesWithSets = await prisma.workoutSet.findMany({ where: { userId: first.userId }, select: { seriesKey: true }, distinct: ["seriesKey"] });
    const prSeries = await prisma.personalRecord.findMany({ where: { userId: first.userId }, select: { seriesKey: true }, distinct: ["seriesKey"] });
    expect(seriesWithSets.length).toBeGreaterThan(0);
    expect(new Set(prSeries.map((p) => p.seriesKey))).toEqual(new Set(seriesWithSets.map((s) => s.seriesKey)));
    const prKeys = await prisma.personalRecord.findMany({ where: { userId: first.userId }, select: { seriesKey: true, type: true, reps: true } });
    expect(new Set(prKeys.map((p) => `${p.seriesKey}:${p.type}:${p.reps}`)).size).toBe(prKeys.length);

    const input = await loadAnalyticsInput(mintUserCtx(first.userId), { today: FIXTURE_TODAY });
    expect(input.sets).toHaveLength(first.sets);
    expect(input.profile).toMatchObject({ sex: "MALE", goal: "HYPERTROPHY", experience: "INTERMEDIATE", heightCm: 180 });
    expect(input.machineProfiles).toHaveLength(3);

    const planted = generateLifterRows({ today: FIXTURE_TODAY }).planted!;
    const cards = runInsightRules(input);
    expect(cards.some((c) => c.id === `insight:stalled-lift:${planted.benchStall.seriesKey}`)).toBe(true);
    expect(cards.some((c) => c.id.startsWith("insight:double-progression:"))).toBe(true);

    const facts = buildWeeklyFacts(input, { weekStart: "2026-10-05" });
    expect(insightFactsSchema.safeParse(facts).success).toBe(true);
    expect(facts.lifts.find((l) => l.seriesKey === planted.benchStall.seriesKey)?.stalled).toBe(true);
    // two full seeds, each now rebuilding the PRs of every series over the network, take longer than the project's 30 s
  }, 120_000);
});
