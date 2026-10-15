import { describe, expect, it } from "vitest";
import { collectFactIds, insightFactsSchema } from "@/contracts/insights";
import { addDays } from "@/lib/dates";
import { FIXTURE_EXERCISES } from "@/lib/fixtures/exercises";
import { makeInput, makeSet, sessionsOf } from "@/lib/fixtures/factories";
import { EDGE_CASE_KINDS, generateEdgeCaseUser, generateLifterHistory, generateLifterRows } from "@/lib/fixtures/generate";
import { buildWeeklyFacts } from "./facts";
import { runInsightRules } from "./insights/rules";

const squat = FIXTURE_EXERCISES.squat.meta;
const bench = FIXTURE_EXERCISES.bench.meta;

describe("buildWeeklyFacts", () => {
  const input = generateLifterHistory();
  const facts = buildWeeklyFacts(input, { weekStart: "2026-10-05" });

  it("passes insightFactsSchema with the documented fact ids", () => {
    expect(insightFactsSchema.safeParse(facts).success).toBe(true);
    const ids = collectFactIds(facts);
    expect(ids.has("lifter") && ids.has("training") && ids.has("body")).toBe(true);
    expect(ids.has(`volume:QUADRICEPS`)).toBe(true);
    expect(ids.has(`lift:${bench.id}`)).toBe(true);
    for (const card of facts.insights) expect(ids.has(card.id)).toBe(true);
  });
  it("summarizes the week and the previous week", () => {
    expect(facts).toMatchObject({ weekStart: "2026-10-05", weekEnd: "2026-10-11", displayUnit: "KG", timezone: "America/New_York" });
    expect(facts.training).toMatchObject({ sessions: 4, isDeloadWeek: false, sessionsPrevWeek: 4 });
    expect(facts.training.trainingDays).toEqual(["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"]);
    expect(facts.training.hardSets).toBeLessThan(facts.training.completedSets); // warm-ups are not hard sets
    expect(facts.training.avgRir).toBeGreaterThan(0);
    expect(facts.lifter).toMatchObject({ sex: "MALE", heightCm: 180, experience: "INTERMEDIATE", goal: "HYPERTROPHY", weeksTraining: 15 });
    expect(facts.volume.find((v) => v.muscle === "QUADRICEPS")).toMatchObject({ fractionalSets: 8, status: "below", priorWeekFractionalSets: 8, bandLow: 10, bandHigh: 20 });
  });
  it("flags the deload week", () => {
    const rows = generateLifterRows();
    const deloadFacts = buildWeeklyFacts(input, { weekStart: rows.planted!.deload.weekStart });
    expect(deloadFacts.training.isDeloadWeek).toBe(true);
    expect(deloadFacts.insights.filter((c) => c.ruleId === "volume-band")).toEqual([]);
  });
  it("has one lift fact per series trained in the last 8 weeks, machine series kept separate, with trend and forecast", () => {
    const keys = facts.lifts.map((l) => l.seriesKey);
    expect(new Set(keys).size).toBe(keys.length);
    const benchLift = facts.lifts.find((l) => l.seriesKey === bench.id)!;
    expect(benchLift).toMatchObject({ stalled: true, trend: "flat", standardLift: "BENCH_PRESS", machineLabel: null });
    expect(benchLift.forecast).toMatchObject({ horizonWeeks: 4 });
    expect(benchLift.bestSet!.reps).toBeGreaterThan(0);
    const squatLift = facts.lifts.find((l) => l.seriesKey === squat.id)!;
    expect(squatLift).toMatchObject({ stalled: false, trend: "up" });
    const machineLifts = facts.lifts.filter((l) => l.machineLabel);
    expect(machineLifts.length).toBeGreaterThan(0);
    // leg press at two gyms: two facts, never merged
    expect(facts.lifts.filter((l) => l.name === "Leg Press").map((l) => l.machineLabel)).toEqual(["Plate-loaded leg press @ Home Gym", "Plate-loaded leg press @ Riverside Fitness"]);
  });
  it("has body facts with the weight cut, tape-derived body fat and FFMI", () => {
    expect(facts.body).toMatchObject({ id: "body", bodyFatMethod: "NAVY_TAPE" });
    expect(facts.body!.weightChangeKg4w).toBeLessThan(-1);
    expect(facts.body!.normalizedFfmi).toBeGreaterThan(18);
    expect(facts.lifter.bodyFatPct).toBe(facts.body!.bodyFatPct);
  });
  it("runs the rules as of the week, ignoring later data", () => {
    const earlier = buildWeeklyFacts(input, { weekStart: "2026-08-10" });
    expect(insightFactsSchema.safeParse(earlier).success).toBe(true);
    expect(earlier.training.sessions).toBe(4);
    expect(earlier.insights).toEqual(runInsightRules({ ...input, today: "2026-08-17", sets: input.sets.filter((s) => s.localDate <= "2026-08-16"), bodyMetrics: input.bodyMetrics.filter((m) => m.localDate <= "2026-08-16") }));
    // a mid-week weekStart is normalized to its Monday
    expect(buildWeeklyFacts(input, { weekStart: "2026-10-07" }).weekStart).toBe("2026-10-05");
  });
  it("reports week PRs against earlier history (a first-ever value is not a PR)", () => {
    const ex = squat.id;
    const earlier = sessionsOf(ex, 3, () => 100, { endDate: "2026-10-04" });
    const thisWeek = [makeSet({ exerciseId: ex, localDate: "2026-10-06", load: 130, reps: 5, rir: 0 })];
    const f = buildWeeklyFacts(makeInput({ today: "2026-10-12", sets: [...earlier, ...thisWeek] }), { weekStart: "2026-10-05" });
    expect(f.prs.map((p) => p.id).sort()).toEqual([`pr:${ex}:E1RM:0`, `pr:${ex}:MAX_LOAD:0`]);
    const e1rm = f.prs.find((p) => p.type === "E1RM")!;
    expect(e1rm).toMatchObject({ value: 151.7, previousValue: 100, achievedOn: "2026-10-06", reps: 0 });
    const first = buildWeeklyFacts(makeInput({ today: "2026-10-12", sets: thisWeek }), { weekStart: "2026-10-05" });
    expect(first.prs).toEqual([]);
  });
  it("copes with every edge-case user and an empty input", () => {
    for (const kind of EDGE_CASE_KINDS) {
      const f = buildWeeklyFacts(generateEdgeCaseUser(kind).input, { weekStart: "2026-10-05" });
      expect(insightFactsSchema.safeParse(f).success).toBe(true);
    }
    const empty = buildWeeklyFacts(makeInput({ today: "2026-10-12" }), { weekStart: "2026-10-05" });
    expect(insightFactsSchema.safeParse(empty).success).toBe(true);
    expect(empty).toMatchObject({ body: null, lifts: [], prs: [], insights: [], volume: [] });
    expect(empty.lifter.weeksTraining).toBeNull();
    expect(empty.training.avgRir).toBeNull();
  });
  it("covers a long layoff and body facts without weights", () => {
    const f = buildWeeklyFacts(generateEdgeCaseUser("layoff").input, { weekStart: addDays("2026-10-05", -35) });
    expect(f.training.sessions).toBe(0);
    const dexa = makeInput({ today: "2026-10-12", bodyMetrics: [{ localDate: "2026-10-01", weightKg: null, bodyFatPct: 15, bodyFatMethod: "DEXA", neckCm: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, calfCm: null }] });
    expect(buildWeeklyFacts(dexa, { weekStart: "2026-10-05" }).body).toMatchObject({ weightKg: null, bodyFatPct: 15, ffmi: null, bodyFatMethod: "DEXA" });
  });
});
