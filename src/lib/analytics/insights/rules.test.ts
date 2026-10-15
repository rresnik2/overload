import { describe, expect, it } from "vitest";
import { INSIGHT_RULE_IDS, type AnalyticsInput, type InsightCard, type MachineProfileMeta } from "@/contracts/analytics";
import { insightCardSchema } from "@/contracts/insights";
import { addDays } from "@/lib/dates";
import { FIXTURE_EXERCISES } from "@/lib/fixtures/exercises";
import { makeInput, makeProfile, makeSet, sessionsOf, type SetOpts } from "@/lib/fixtures/factories";
import { generateEdgeCaseUser, generateLifterHistory } from "@/lib/fixtures/generate";
import { CITATIONS } from "../constants";
import { INSIGHT_RULES, runInsightRules } from "./rules";

const squat = FIXTURE_EXERCISES.squat.meta;
const bench = FIXTURE_EXERCISES.bench.meta;
const row = FIXTURE_EXERCISES.row.meta;
const legCurl = FIXTURE_EXERCISES.legCurl.meta;
const legPress = FIXTURE_EXERCISES.legPress.meta;
const pullUp = FIXTURE_EXERCISES.pullUp.meta;
const inclineDb = FIXTURE_EXERCISES.inclineDb.meta;
const TODAY = "2026-10-12"; // a Monday: the last complete week is 2026-10-05..11
const run = (id: (typeof INSIGHT_RULE_IDS)[number], input: AnalyticsInput): InsightCard[] => INSIGHT_RULES[id](input);
const week = (day: number) => addDays("2026-10-05", day);
const many = (n: number, over: SetOpts) => Array.from({ length: n }, () => makeSet(over));

describe("rule registry", () => {
  it("has one rule per id, in order, and the runner concatenates them deterministically", () => {
    expect(Object.keys(INSIGHT_RULES)).toEqual([...INSIGHT_RULE_IDS]);
    const input = generateLifterHistory();
    expect(runInsightRules(input)).toEqual(runInsightRules(input));
    expect(runInsightRules(makeInput())).toEqual([]);
  });
  it("every card is schema-valid, uses unique ids that start with its rule id, and cites only known keys", () => {
    const inputs = [
      generateLifterHistory(),
      generateLifterHistory({ strengthDropDuringCut: true }),
      ...(["brand-new", "one-session", "layoff", "mixed-units", "no-bodyweight", "prefer-not-to-say"] as const).map((k) => generateEdgeCaseUser(k).input),
    ];
    for (const input of inputs) {
      const cards = runInsightRules(input);
      expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
      for (const c of cards) {
        expect(insightCardSchema.safeParse(c).success).toBe(true);
        expect(c.id.startsWith(`insight:${c.ruleId}`)).toBe(true);
        for (const key of c.citations) expect(CITATIONS).toHaveProperty(key);
      }
    }
  });
});

describe("1. volume-band", () => {
  const sets = (n: number, over: SetOpts = {}) => many(n, { exerciseId: squat.id, localDate: week(1), ...over });
  it("flags a muscle below the band (>= 2 direct sets)", () => {
    const [card] = run("volume-band", makeInput({ today: TODAY, sets: sets(4) }));
    expect(card).toMatchObject({ id: "insight:volume-band:QUADRICEPS", severity: "suggestion", subject: { muscle: "QUADRICEPS" } });
    expect(card!.body).toContain("10-20");
    expect(card!.citations).toEqual(["schoenfeld2017volume", "pelland2025", "bazvalle2022"]);
  });
  it("flags a muscle above the band and uses the strength band for strength goals", () => {
    const [above] = run("volume-band", makeInput({ today: TODAY, sets: sets(22) }));
    expect(above).toMatchObject({ severity: "info", title: "High weekly volume for quadriceps" });
    const [strength] = run("volume-band", makeInput({ today: TODAY, profile: makeProfile({ goal: "STRENGTH" }), sets: sets(12) }));
    expect(strength!.body).toContain("4-10");
    expect(strength!.citations).toEqual(["pelland2025"]);
  });
  it("stays quiet within the band, with too few direct sets, in a deload week and with no goal fallback issue", () => {
    expect(run("volume-band", makeInput({ today: TODAY, sets: sets(12) }))).toEqual([]);
    expect(run("volume-band", makeInput({ today: TODAY, sets: [...sets(1), ...many(3, { exerciseId: bench.id, localDate: week(1) })] })).map((c) => c.subject?.muscle)).not.toContain("QUADRICEPS");
    expect(run("volume-band", makeInput({ today: TODAY, sets: sets(4, { isDeload: true }) }))).toEqual([]);
    expect(run("volume-band", makeInput({ today: TODAY, profile: makeProfile({ goal: null }), sets: sets(4) }))).toHaveLength(1);
  });
});

describe("2. stalled-lift", () => {
  it("flags a flat series and names the machine when there is one", () => {
    const flat = sessionsOf(squat.id, 12, () => 100);
    const [card] = run("stalled-lift", makeInput({ today: TODAY, sets: flat }));
    expect(card).toMatchObject({ ruleId: "stalled-lift", severity: "suggestion", subject: { exerciseId: squat.id } });
    expect(card!.body).toContain("deload");
    const machine: MachineProfileMeta = { id: "m1", name: "Press", gymName: "Gym A", brand: null, exerciseId: legPress.id, labelUnit: "KG", pinStepKg: null, baseLoadKg: 0 };
    const [mc] = run("stalled-lift", makeInput({ today: TODAY, machineProfiles: [machine], sets: sessionsOf(legPress.id, 12, () => 200, { machineProfileId: "m1" }) }));
    expect(mc!.title).toContain("Gym A");
    expect(mc!.body).toContain("this machine's own history");
  });
  it("stays quiet when progressing, with too little history, or for non-load tracking", () => {
    expect(run("stalled-lift", makeInput({ today: TODAY, sets: sessionsOf(squat.id, 12, (i) => 100 + 3 * i) }))).toEqual([]);
    expect(run("stalled-lift", makeInput({ today: TODAY, sets: sessionsOf(squat.id, 3, () => 100) }))).toEqual([]);
    const timed = { ...squat, tracking: "DURATION" as const };
    expect(run("stalled-lift", makeInput({ today: TODAY, exercises: [timed], sets: sessionsOf(squat.id, 12, () => 100) }))).toEqual([]);
  });
});

describe("3. double-progression", () => {
  const two = (exerciseId: string, reps: number, over: SetOpts = {}) => [
    ...many(3, { exerciseId, localDate: week(-5), load: 60, reps, rir: 1, ...over }),
    ...many(3, { exerciseId, localDate: week(1), load: 60, reps, rir: 1, ...over }),
  ];
  it("nudges load after a 2-for-2 on a barbell", () => {
    const [card] = run("double-progression", makeInput({ today: TODAY, sets: two(squat.id, 14) }));
    expect(card).toMatchObject({ id: `insight:double-progression:${squat.id}`, title: expect.stringContaining("add load") });
    expect(card!.evidence.map((e) => e.label)).toContain("Suggested next load");
  });
  it("says add reps first on a machine with a stack jump over 10%", () => {
    const machine: MachineProfileMeta = { id: "m1", name: "Leg curl", gymName: null, brand: null, exerciseId: legCurl.id, labelUnit: "LB", pinStepKg: 4.536, baseLoadKg: null };
    const sets = two(legCurl.id, 14, { machineProfileId: "m1", load: 40.8 });
    const [card] = run("double-progression", makeInput({ today: TODAY, machineProfiles: [machine], sets }));
    expect(card!.title).toContain("add reps before the next jump");
    expect(card!.evidence.map((e) => e.label)).toContain("Rep target");
  });
  it("derives the increment for plates-per-side and per-implement exercises", () => {
    expect(run("double-progression", makeInput({ today: TODAY, sets: two(legPress.id, 14, { load: 140 }) }))).toHaveLength(1);
    expect(run("double-progression", makeInput({ today: TODAY, sets: two(inclineDb.id, 14, { load: 30 }) }))).toHaveLength(1);
  });
  it("stays quiet when holding, with no loaded sets, unknown exercises, or bodyweight-plus work", () => {
    expect(run("double-progression", makeInput({ today: TODAY, sets: two(squat.id, 10) }))).toEqual([]);
    expect(run("double-progression", makeInput({ today: TODAY, sets: two(squat.id, 14, { effectiveLoadKg: null, weightKg: null }) }))).toEqual([]);
    expect(run("double-progression", makeInput({ today: TODAY, sets: two("unknown-ex", 14) }))).toEqual([]);
    expect(run("double-progression", makeInput({ today: TODAY, sets: two(pullUp.id, 14) }))).toEqual([]);
  });
  it("uses the goal's default rep range", () => {
    const strength = run("double-progression", makeInput({ today: TODAY, profile: makeProfile({ goal: "STRENGTH" }), sets: two(squat.id, 8) }));
    expect(strength).toHaveLength(1);
    expect(strength[0]!.body).toContain("3-6");
  });
});

describe("4. effort-check", () => {
  const rirSets = (n: number, rir: number) => many(n, { exerciseId: squat.id, localDate: week(1), rir });
  it("flags a typical RIR of 4 or more", () => {
    const [card] = run("effort-check", makeInput({ today: TODAY, sets: rirSets(20, 5) }));
    expect(card).toMatchObject({ id: "insight:effort-check", severity: "suggestion" });
    expect(card!.citations).toContain("robinson2024");
  });
  it("needs enough logged sets and a high median; ignores warm-ups and deloads", () => {
    expect(run("effort-check", makeInput({ today: TODAY, sets: rirSets(10, 5) }))).toEqual([]);
    expect(run("effort-check", makeInput({ today: TODAY, sets: rirSets(20, 2) }))).toEqual([]);
    expect(run("effort-check", makeInput({ today: TODAY, sets: rirSets(20, 5).map((s) => ({ ...s, setType: "WARMUP" as const })) }))).toEqual([]);
    expect(run("effort-check", makeInput({ today: TODAY, sets: rirSets(20, 5).map((s) => ({ ...s, isDeload: true })) }))).toEqual([]);
  });
});

describe("5. frequency-session-cap", () => {
  it("flags more than ~11 fractional sets for a muscle in one session, labelled as a contested preprint", () => {
    const sets = many(14, { exerciseId: squat.id, localDate: week(1), workoutId: "w-long" });
    const cards = run("frequency-session-cap", makeInput({ today: TODAY, sets }));
    const quads = cards.find((c) => c.subject?.muscle === "QUADRICEPS")!;
    expect(quads.title).toContain("[Contested, preprint]");
    expect(quads.citations).toEqual(["remmert2025"]);
    expect(run("frequency-session-cap", makeInput({ today: TODAY, sets: many(10, { exerciseId: squat.id, localDate: week(1) }) }))).toEqual([]);
    // the same sets split over two sessions are fine
    const split = [...many(7, { exerciseId: squat.id, localDate: week(1), workoutId: "a" }), ...many(7, { exerciseId: squat.id, localDate: week(3), workoutId: "b" })];
    expect(run("frequency-session-cap", makeInput({ today: TODAY, sets: split }))).toEqual([]);
  });
  it("nudges strength-goal lifts trained about once a week toward two sessions", () => {
    const sets = [week(-20), week(-13), week(-6), week(1)].flatMap((d) => many(3, { exerciseId: bench.id, localDate: d }));
    const strength = makeProfile({ goal: "STRENGTH" });
    const [card] = run("frequency-session-cap", makeInput({ today: TODAY, profile: strength, sets }));
    expect(card).toMatchObject({ id: `insight:frequency-session-cap:${bench.id}`, severity: "info", citations: ["pelland2025"] });
    expect(run("frequency-session-cap", makeInput({ today: TODAY, sets }))).toEqual([]);
    const twice = [week(-20), week(-17), week(-13), week(-10), week(-6), week(-3), week(1), week(4)].flatMap((d) => many(3, { exerciseId: bench.id, localDate: d }));
    expect(run("frequency-session-cap", makeInput({ today: TODAY, profile: strength, sets: twice }))).toEqual([]);
    expect(run("frequency-session-cap", makeInput({ today: TODAY, profile: strength, sets: many(3, { exerciseId: bench.id, localDate: week(1) }) }))).toEqual([]);
    // machine series and exercises without a standard lift are skipped
    expect(run("frequency-session-cap", makeInput({ today: TODAY, profile: strength, sets: [week(-6), week(1)].flatMap((d) => many(3, { exerciseId: legPress.id, machineProfileId: "m", localDate: d })) }))).toEqual([]);
  });
});

describe("6. rep-range-goal", () => {
  const repSets = (n: number, reps: number) => many(n, { exerciseId: squat.id, localDate: week(1), reps });
  it("flags high-rep work for a strength goal and very heavy singles for a hypertrophy goal", () => {
    const [strength] = run("rep-range-goal", makeInput({ today: TODAY, profile: makeProfile({ goal: "STRENGTH" }), sets: repSets(24, 12) }));
    expect(strength).toMatchObject({ id: "insight:rep-range-goal", citations: ["schoenfeld2017load"] });
    expect(strength!.title).toContain("strength");
    const [size] = run("rep-range-goal", makeInput({ today: TODAY, profile: makeProfile({ goal: "HYPERTROPHY" }), sets: repSets(24, 2) }));
    expect(size!.title).toContain("size");
  });
  it("is quiet for general goals, small samples, matching ranges and non-load tracking", () => {
    expect(run("rep-range-goal", makeInput({ today: TODAY, profile: makeProfile({ goal: "GENERAL" }), sets: repSets(24, 12) }))).toEqual([]);
    expect(run("rep-range-goal", makeInput({ today: TODAY, profile: makeProfile({ goal: "STRENGTH" }), sets: repSets(5, 12) }))).toEqual([]);
    expect(run("rep-range-goal", makeInput({ today: TODAY, profile: makeProfile({ goal: "STRENGTH" }), sets: repSets(24, 5) }))).toEqual([]);
    const timed = { ...squat, tracking: "DURATION" as const };
    expect(run("rep-range-goal", makeInput({ today: TODAY, exercises: [timed], profile: makeProfile({ goal: "STRENGTH" }), sets: repSets(24, 12) }))).toEqual([]);
  });
});

describe("7. relative-strength-percentile", () => {
  it("emits nothing while no standards table is registered, or without sex/bodyweight", () => {
    const sets = sessionsOf(squat.id, 8, () => 140);
    expect(run("relative-strength-percentile", makeInput({ today: TODAY, sets, bodyMetrics: [{ ...bm("2026-10-05"), weightKg: 85 }] }))).toEqual([]);
    expect(run("relative-strength-percentile", makeInput({ today: TODAY, profile: makeProfile({ sex: null }), sets }))).toEqual([]);
    expect(run("relative-strength-percentile", makeInput({ today: TODAY, sets }))).toEqual([]);
  });
});

function bm(localDate: string) {
  return { localDate, weightKg: null, bodyFatPct: null, bodyFatMethod: null, neckCm: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, calfCm: null };
}

describe("8. on-track-vs-population", () => {
  it("celebrates progress far above the population curve and ignores typical progress", () => {
    const fast = sessionsOf(squat.id, 12, (i) => 100 * (1 + 0.03 * i));
    const [card] = run("on-track-vs-population", makeInput({ today: TODAY, sets: fast }));
    expect(card).toMatchObject({ id: `insight:on-track-vs-population:${squat.id}`, severity: "celebration" });
    expect(card!.citations).toEqual(["steele2022", "latella2020", "swinton2021"]);
    expect(run("on-track-vs-population", makeInput({ today: TODAY, sets: sessionsOf(squat.id, 12, (i) => 100 + 0.1 * i) }))).toEqual([]);
    expect(run("on-track-vs-population", makeInput({ today: TODAY, sets: sessionsOf(squat.id, 3, () => 100) }))).toEqual([]);
  });
  it("says slower than the curve only for a clear decline", () => {
    const sets = sessionsOf(row.id, 40, (i) => 100 - 1.5 * i, { everyDays: 3 });
    const [card] = run("on-track-vs-population", makeInput({ today: TODAY, profile: makeProfile({ experience: "BEGINNER" }), sets }));
    expect(card).toMatchObject({ severity: "info" });
    expect(card!.title).toContain("slower");
  });
});

describe("9. ffmi-context", () => {
  const tape = { ...bm("2026-10-05"), weightKg: 80, neckCm: 39, waistCm: 92 };
  it("gives a normalized FFMI range with the sex-specific reference, neutrally", () => {
    const [card] = run("ffmi-context", makeInput({ today: TODAY, bodyMetrics: [tape] }));
    expect(card).toMatchObject({ id: "insight:ffmi-context", severity: "info", citations: ["kouri1995", "hodgdon1984"] });
    expect(card!.body).toContain("[Contested]");
    expect(card!.body).toContain("not a verdict");
    const [women] = run("ffmi-context", makeInput({ today: TODAY, profile: makeProfile({ sex: "FEMALE" }), bodyMetrics: [{ ...tape, hipCm: 100, neckCm: 33, waistCm: 80 }] }));
    expect(women!.citations).toEqual(["harty2019", "hodgdon1984"]);
  });
  it("works with a stored DEXA value, and omits the reference for PREFER_NOT_TO_SAY", () => {
    const dexa = { ...bm("2026-10-05"), weightKg: 80, bodyFatPct: 15, bodyFatMethod: "DEXA" as const };
    const [card] = run("ffmi-context", makeInput({ today: TODAY, profile: makeProfile({ sex: "PREFER_NOT_TO_SAY" }), bodyMetrics: [dexa] }));
    expect(card!.citations).toEqual([]);
    expect(card!.body).not.toContain("For reference");
  });
  it("needs height, bodyweight and a usable body-fat source", () => {
    expect(run("ffmi-context", makeInput({ today: TODAY, profile: makeProfile({ heightCm: null }), bodyMetrics: [tape] }))).toEqual([]);
    expect(run("ffmi-context", makeInput({ today: TODAY, bodyMetrics: [{ ...tape, neckCm: null, waistCm: null }] }))).toEqual([]);
    expect(run("ffmi-context", makeInput({ today: TODAY, bodyMetrics: [{ ...tape, weightKg: null }] }))).toEqual([]);
  });
});

describe("10. cut-strength-drop", () => {
  const weights = (from: number, perWeek: number) =>
    Array.from({ length: 9 }, (_, i) => ({ ...bm(addDays(TODAY, -56 + 7 * i)), weightKg: from - perWeek * i }));
  const falling = (key: typeof squat.id) => sessionsOf(key, 12, (i) => 140 - 2.5 * i, { everyDays: 5 });
  it("fires when bodyweight falls >= 2% in 4 weeks and at least two lifts drop beyond noise", () => {
    const sets = [...falling(squat.id), ...falling(bench.id)];
    const [card] = run("cut-strength-drop", makeInput({ today: TODAY, sets, bodyMetrics: weights(90, 1) }));
    expect(card).toMatchObject({ id: "insight:cut-strength-drop", severity: "warning" });
    expect(card!.body).toContain("1.6 g per kg");
    expect(card!.body).toContain("slowing the cut");
  });
  it("stays quiet when weight is stable, strength holds, or only one lift drops", () => {
    const sets = [...falling(squat.id), ...falling(bench.id)];
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets, bodyMetrics: weights(90, 0) }))).toEqual([]);
    const holding = [...sessionsOf(squat.id, 12, () => 140, { everyDays: 5 }), ...sessionsOf(bench.id, 12, () => 100, { everyDays: 5 })];
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets: holding, bodyMetrics: weights(90, 1) }))).toEqual([]);
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets: falling(squat.id), bodyMetrics: weights(90, 1) }))).toEqual([]);
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets, bodyMetrics: [] }))).toEqual([]);
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets, bodyMetrics: weights(90, 1).slice(6) }))).toEqual([]);
    // machine series do not count as strength evidence
    const machine = [...falling(legPress.id), ...falling(legCurl.id)].map((s) => ({ ...s, machineProfileId: "m" }));
    expect(run("cut-strength-drop", makeInput({ today: TODAY, sets: machine, bodyMetrics: weights(90, 1) }))).toEqual([]);
  });
});

describe("10b. cut-strength-drop for a weight-loss goal", () => {
  const weights = (from: number, perWeek: number) =>
    Array.from({ length: 9 }, (_, i) => ({ ...bm(addDays(TODAY, -56 + 7 * i)), weightKg: from - perWeek * i }));
  const falling = (key: typeof squat.id) => sessionsOf(key, 12, (i) => 140 - 2.5 * i, { everyDays: 5 });
  it("treats the loss as expected context and softens the severity", () => {
    const sets = [...falling(squat.id), ...falling(bench.id)];
    const [card] = run("cut-strength-drop", makeInput({ today: TODAY, profile: makeProfile({ goal: "FAT_LOSS" }), sets, bodyMetrics: weights(90, 1) }));
    expect(card).toMatchObject({ severity: "suggestion", title: "Strength is dipping while you lose weight" });
    expect(card!.body).toContain("holding strength is the aim");
  });
});

describe("11. weight-change-rate", () => {
  /** A weigh-in every 3 days for 8 weeks, losing `pctPerWeek` percent of 90 kg per week. */
  const daily = (pctPerWeek: number, over: { stopAfterDay?: number } = {}) =>
    Array.from({ length: 19 }, (_, i) => 3 * i)
      .filter((d) => d <= (over.stopAfterDay ?? 56))
      .map((d) => ({ ...bm(addDays(TODAY, -56 + d)), weightKg: 90 * (1 - (pctPerWeek / 100) * (d / 7)) }));
  const loseWeight = makeProfile({ goal: "FAT_LOSS" });
  const rate = (profile: ReturnType<typeof makeProfile>, bodyMetrics: ReturnType<typeof daily>) => run("weight-change-rate", makeInput({ today: TODAY, profile, bodyMetrics }));

  it("flags a loss faster than 1% a week, strongest for the weight-loss goal", () => {
    const [card] = rate(loseWeight, daily(1.6));
    expect(card).toMatchObject({ id: "insight:weight-change-rate", severity: "warning", citations: ["helms2014"] });
    expect(card!.body).toContain("risks muscle and strength");
    expect(card!.body).not.toMatch(/calorie|kcal/i);
    const [other] = rate(makeProfile({ goal: "HYPERTROPHY" }), daily(1.6));
    expect(other).toMatchObject({ severity: "suggestion" });
  });
  it("celebrates an on-target pace (0.5-1% a week) for the weight-loss goal only", () => {
    const [card] = rate(loseWeight, daily(0.75));
    expect(card).toMatchObject({ severity: "celebration" });
    expect(card!.evidence.find((e) => e.label === "Bodyweight trend rate")!.value).toBeLessThan(0);
    // another goal gets the neutral "falling" note instead
    expect(rate(makeProfile({ goal: "STRENGTH" }), daily(0.75))[0]).toMatchObject({ severity: "info", title: "Your bodyweight trend is falling" });
  });
  it("flags a stall (under 0.25% a week for three weeks) for the weight-loss goal, not for other goals", () => {
    const flat = daily(0);
    const [card] = rate(loseWeight, flat);
    expect(card).toMatchObject({ severity: "suggestion", title: expect.stringContaining("flat") });
    expect(rate(makeProfile({ goal: "GENERAL" }), flat)).toEqual([]);
    expect(rate(makeProfile({ goal: null }), daily(-0.8))).toEqual([]); // gaining is not this rule's business
  });
  it("is quiet for a slow-but-moving loss, sparse or stale weigh-ins, and no data", () => {
    expect(rate(loseWeight, daily(0.35))).toEqual([]);
    expect(rate(loseWeight, daily(1.6).filter((_, i) => i % 6 === 0))).toEqual([]); // too few weigh-ins in the window
    expect(rate(loseWeight, daily(1.6, { stopAfterDay: 30 }))).toEqual([]); // last weigh-in is stale
    expect(rate(loseWeight, [])).toEqual([]);
  });
});

describe("8b. on-track-vs-population for a weight-loss goal", () => {
  it("does not say 'slower than the curve' while the goal is to lose weight and keep strength", () => {
    const sets = sessionsOf(row.id, 40, (i) => 100 - 1.5 * i, { everyDays: 3 });
    const input = (goal: "FAT_LOSS" | "HYPERTROPHY") => makeInput({ today: TODAY, profile: makeProfile({ experience: "BEGINNER", goal }), sets });
    expect(run("on-track-vs-population", input("FAT_LOSS"))).toEqual([]);
    expect(run("on-track-vs-population", input("HYPERTROPHY"))).toHaveLength(1);
  });
});

describe("planted fixture", () => {
  it("fires the cut rule only when strength is planted to drop during the cut", () => {
    expect(runInsightRules(generateLifterHistory()).some((c) => c.ruleId === "cut-strength-drop")).toBe(false);
    expect(runInsightRules(generateLifterHistory({ strengthDropDuringCut: true })).some((c) => c.ruleId === "cut-strength-drop")).toBe(true);
  });
});
