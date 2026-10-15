// The eleven insight rules + the runner. Each rule is a pure function AnalyticsInput -> InsightCard[]; the runner
// concatenates them in INSIGHT_RULE_IDS order, so the same input always gives the same cards in the same order.
// Language is neutral and non-medical; machine series are never compared with barbell numbers; hyperplasia is not a mode.
import { INSIGHT_RULE_IDS, type AnalyticsInput, type InsightCard, type InsightRule, type InsightRuleId, type RunInsightRules } from "@/contracts/analytics";
import type { Muscle } from "@/contracts/enums";
import { addDays, diffDays } from "@/lib/dates";
import { defaultIncrement } from "@/lib/units";
import {
  CUT_PROTEIN_G_PER_KG,
  FALLING_WEIGHT_NOTICE_PCT_PER_WEEK,
  LOSS_RATE_TARGET_MAX_PCT_PER_WEEK,
  LOSS_RATE_TARGET_MIN_PCT_PER_WEEK,
  LOSS_STALL_PCT_PER_WEEK,
  LOSS_STALL_WEEKS,
  RATE_MIN_WEIGH_INS,
  RATE_WINDOW_DAYS,
  CUT_WEIGHT_LOSS_FRACTION_4W,
  DEFAULT_REP_RANGE,
  DEFAULT_VOLUME_GOAL,
  EFFORT_CHECK_MEDIAN_RIR,
  EFFORT_CHECK_MIN_RECORDED_SETS,
  FFMI_REFERENCE,
  FREQUENCY_LOW_SESSIONS_PER_WEEK,
  HYPERTROPHY_GOAL_LOW_REP_TO,
  INSIGHT_WINDOW_WEEKS,
  NOISE_THRESHOLD,
  REP_RANGE_MIN_SETS,
  REP_RANGE_OFF_SHARE,
  SESSION_SET_CAP,
  STRENGTH_GOAL_HIGH_REP_FROM,
} from "../constants";
import { compareToPopulation, median } from "../forecast";
import { detectStall, evaluateProgression } from "../progression";
import { allometric, bodyweightTrend, ffmi, resolveBodyFat } from "../scores";
import { strengthPercentile } from "../standards";
import { weeklyMuscleVolume } from "../volume";
import {
  bodyweightSeries,
  buildSeries,
  firstWorkoutDate,
  lastCompleteWeek,
  latestBodyweightKg,
  makeCard,
  muscleName,
  r1,
  type SeriesInfo,
} from "./context";

const windowStart = (today: string, weeks = INSIGHT_WINDOW_WEEKS) => addDays(today, -7 * weeks + 1);
const bandText = (low: number, high: number) => `${low}-${high}`;
const LOAD_REPS_STACKABLE = new Set(["TOTAL", "PER_IMPLEMENT", "PLATES_PER_SIDE", "STACK"]);

/** 1. Weekly volume below the floor or above the ceiling of the goal's band (last completed week, non-deload). */
const volumeBand: InsightRule = (input) => {
  const { weekStart, weekEnd } = lastCompleteWeek(input.today);
  if (input.sets.some((s) => s.localDate >= weekStart && s.localDate <= weekEnd && s.isDeload)) return [];
  const goal = input.profile.goal ?? DEFAULT_VOLUME_GOAL;
  const cards: InsightCard[] = [];
  for (const v of weeklyMuscleVolume({ sets: input.sets, exercises: input.exercises, weekStart, goal: input.profile.goal })) {
    if (v.directSets < 2 || v.status === "within" || v.status === "none") continue;
    const name = muscleName(v.muscle);
    const range = bandText(v.band.low, v.band.high);
    const below = v.status === "below";
    cards.push(
      makeCard({
        id: `insight:volume-band:${v.muscle}`,
        ruleId: "volume-band",
        severity: below ? "suggestion" : "info",
        title: below ? `Low weekly volume for ${name}` : `High weekly volume for ${name}`,
        body: below
          ? `You did ${v.fractionalSets} fractional sets for ${name} last week, under the ${range} band for a ${goal.toLowerCase()} goal. Direct sets count 1.0 and indirect sets 0.5. If growth here is a priority, adding a few hard sets is the simplest lever.`
          : `You did ${v.fractionalSets} fractional sets for ${name} last week, above the ${range} band for a ${goal.toLowerCase()} goal. Returns diminish at high volume, so more is not necessarily better; fewer sets with the same effort is a fair test.`,
        evidence: [
          { label: "Fractional sets", value: v.fractionalSets },
          { label: "Direct sets", value: v.directSets },
          { label: "Indirect sets", value: v.indirectSets },
          { label: "Band low", value: v.band.low },
          { label: "Band high", value: v.band.high },
        ],
        citations: goal === "STRENGTH" ? ["pelland2025"] : ["schoenfeld2017volume", "pelland2025", "bazvalle2022"],
        subject: { muscle: v.muscle },
      }),
    );
  }
  return cards;
};

/** 2. A lift whose best e1RM has not improved beyond noise (~5%) between two 6-week windows. */
const stalledLift: InsightRule = (input) => {
  const cards: InsightCard[] = [];
  for (const s of buildSeries(input)) {
    if (s.exercise?.tracking !== "LOAD_REPS") continue;
    const stall = detectStall(s.points, input.today);
    if (!stall.stalled || stall.changePct == null) continue;
    cards.push(
      makeCard({
        id: `insight:stalled-lift:${s.seriesKey}`,
        ruleId: "stalled-lift",
        severity: "suggestion",
        title: `${s.label}: no clear progress`,
        body: `The best estimated 1RM for ${s.label} moved ${stall.changePct}% over the last ${stall.weeksSpanned} weeks, inside the ~5% range that is just test-to-test noise. Options: a planned deload week, a variation of the lift, or a different rep range for a few weeks.${s.isMachine ? " This compares only this machine's own history." : ""}`,
        evidence: [
          { label: "Change in best e1RM", value: stall.changePct, unit: "%" },
          { label: "Sessions considered", value: stall.sessions },
          { label: "Weeks spanned", value: stall.weeksSpanned },
        ],
        citations: ["grgic2020", "bell2023"],
        subject: { seriesKey: s.seriesKey, exerciseId: s.exerciseId },
      }),
    );
  }
  return cards;
};

function incrementKgFor(s: SeriesInfo): number {
  if (s.machine?.pinStepKg) return s.machine.pinStepKg;
  const ex = s.exercise;
  const perEntry = defaultIncrement("KG", ex?.equipment ?? "OTHER");
  const factor = ex?.loadType === "PLATES_PER_SIDE" || (ex?.loadType === "PER_IMPLEMENT" && !ex.isUnilateral) ? 2 : 1;
  return perEntry * factor;
}

/** 3. Double progression with the 2-for-2 rule; machine stack jumps over 10% add reps first. */
const doubleProgression: InsightRule = (input) => {
  const range = DEFAULT_REP_RANGE[input.profile.goal ?? DEFAULT_VOLUME_GOAL];
  const from = windowStart(input.today);
  const cards: InsightCard[] = [];
  for (const s of buildSeries(input)) {
    const ex = s.exercise;
    if (!ex || ex.tracking !== "LOAD_REPS" || !LOAD_REPS_STACKABLE.has(ex.loadType)) continue;
    const recent = s.sets.filter((x) => x.localDate >= from && !x.isDeload);
    const loaded = recent.filter((x) => x.setType !== "WARMUP" && x.effectiveLoadKg != null);
    if (!loaded.length) continue;
    const currentLoadKg = loaded[loaded.length - 1]!.effectiveLoadKg as number;
    const ev = evaluateProgression({
      sets: recent,
      repMin: range.min,
      repMax: range.max,
      modality: ex.modality,
      incrementKg: incrementKgFor(s),
      currentLoadKg,
    });
    const sug = ev.suggestion;
    const repsFirst = sug.kind === "add_reps" && ev.bigJump && ev.twoForTwo;
    if (sug.kind !== "add_load" && !repsFirst) continue;
    cards.push(
      makeCard({
        id: `insight:double-progression:${s.seriesKey}`,
        ruleId: "double-progression",
        severity: "suggestion",
        title: repsFirst ? `${s.label}: add reps before the next jump` : `${s.label}: time to add load`,
        body: `${sug.rationale} (Rep range assumed from your goal: ${range.min}-${range.max}.)`,
        evidence: [
          { label: "Current load", value: r1(currentLoadKg), unit: "kg" },
          ...(sug.kind === "add_load" && sug.nextLoadKg != null ? [{ label: "Suggested next load", value: r1(sug.nextLoadKg), unit: "kg" }] : []),
          ...(sug.nextRepTarget != null ? [{ label: "Rep target", value: sug.nextRepTarget }] : []),
        ],
        citations: [],
        subject: { seriesKey: s.seriesKey, exerciseId: s.exerciseId },
      }),
    );
  }
  return cards;
};

/** 4. Typical RIR of 4 or more: sets are far from failure. */
const effortCheck: InsightRule = (input) => {
  const from = windowStart(input.today);
  const rirs = input.sets
    .filter((s) => s.localDate >= from && s.localDate <= input.today && !s.isDeload && s.setType !== "WARMUP" && s.rir != null)
    .map((s) => s.rir as number);
  if (rirs.length < EFFORT_CHECK_MIN_RECORDED_SETS) return [];
  const typical = median(rirs);
  if (typical < EFFORT_CHECK_MEDIAN_RIR) return [];
  return [
    makeCard({
      id: "insight:effort-check",
      ruleId: "effort-check",
      severity: "suggestion",
      title: "Most sets stop far from failure",
      body: `Your typical logged effort over the last ${INSIGHT_WINDOW_WEEKS} weeks is ${r1(typical)} reps in reserve. Growth is similar when sets end about 0-3 reps from failure, and sets that stop 4 or more short count for less. Reps-in-reserve guesses are least reliable at 4+, so you may be closer to failure than it feels.`,
      evidence: [
        { label: "Median RIR", value: r1(typical) },
        { label: "Sets with RIR logged", value: rirs.length },
      ],
      citations: ["robinson2024", "refalo2023", "zourdos2021"],
    }),
  ];
};

/** 5. Per-session cap (a PREPRINT, [Contested]) and, for strength goals, lifts trained once a week. */
const frequencySessionCap: InsightRule = (input) => {
  const cards: InsightCard[] = [];
  const { weekStart, weekEnd } = lastCompleteWeek(input.today);

  const weekSets = input.sets.filter((s) => s.localDate >= weekStart && s.localDate <= weekEnd);
  const workouts = [...new Set(weekSets.map((s) => s.workoutId))].sort();
  const peak = new Map<Muscle, number>();
  for (const workoutId of workouts) {
    const sets = weekSets.filter((s) => s.workoutId === workoutId);
    for (const v of weeklyMuscleVolume({ sets, exercises: input.exercises, weekStart, goal: input.profile.goal })) {
      if (v.fractionalSets > SESSION_SET_CAP) peak.set(v.muscle, Math.max(peak.get(v.muscle) ?? 0, v.fractionalSets));
    }
  }
  for (const [muscle, fractional] of [...peak.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const name = muscleName(muscle);
    cards.push(
      makeCard({
        id: `insight:frequency-session-cap:${muscle}`,
        ruleId: "frequency-session-cap",
        severity: "info",
        title: `A long ${name} session [Contested, preprint]`,
        body: `One session last week had ${fractional} fractional sets for ${name}. A 2025 preprint (not yet peer reviewed, and contested) suggests returns shrink past about ${SESSION_SET_CAP} per muscle per session. Treat it as a hint, not a rule: splitting the work over another day is one option.`,
        evidence: [
          { label: "Fractional sets in one session", value: fractional },
          { label: "Preprint ceiling", value: SESSION_SET_CAP },
        ],
        citations: ["remmert2025"],
        subject: { muscle },
      }),
    );
  }

  if (input.profile.goal === "STRENGTH") {
    const from = windowStart(input.today);
    for (const s of buildSeries(input)) {
      if (!s.exercise?.standardLift || s.isMachine) continue;
      const days = new Set(s.sets.filter((x) => x.localDate >= from && x.setType !== "WARMUP" && !x.isDeload).map((x) => x.localDate));
      const perWeek = days.size / INSIGHT_WINDOW_WEEKS;
      if (days.size < 2 || perWeek > FREQUENCY_LOW_SESSIONS_PER_WEEK) continue;
      cards.push(
        makeCard({
          id: `insight:frequency-session-cap:${s.seriesKey}`,
          ruleId: "frequency-session-cap",
          severity: "info",
          title: `${s.label}: about once a week`,
          body: `You trained ${s.label} on ${days.size} days in the last ${INSIGHT_WINDOW_WEEKS} weeks. For strength, frequency clearly helps, especially going from one to two sessions a week at the same total volume.`,
          evidence: [
            { label: "Sessions in window", value: days.size },
            { label: "Sessions per week", value: r1(perWeek) },
          ],
          citations: ["pelland2025"],
          subject: { seriesKey: s.seriesKey, exerciseId: s.exerciseId },
        }),
      );
    }
  }
  return cards;
};

/** 6. Rep range does not match the goal. */
const repRangeGoal: InsightRule = (input) => {
  const goal = input.profile.goal;
  if (goal !== "STRENGTH" && goal !== "HYPERTROPHY") return [];
  const from = windowStart(input.today);
  const exercises = new Map(input.exercises.map((e) => [e.id, e]));
  const reps = input.sets
    .filter((s) => s.localDate >= from && s.localDate <= input.today && !s.isDeload && s.setType !== "WARMUP" && s.setType !== "DROP" && s.reps != null && s.reps >= 1)
    .filter((s) => exercises.get(s.exerciseId)?.tracking === "LOAD_REPS")
    .map((s) => s.reps as number);
  if (reps.length < REP_RANGE_MIN_SETS) return [];
  const off = goal === "STRENGTH" ? reps.filter((r) => r >= STRENGTH_GOAL_HIGH_REP_FROM) : reps.filter((r) => r <= HYPERTROPHY_GOAL_LOW_REP_TO);
  const share = off.length / reps.length;
  if (share < REP_RANGE_OFF_SHARE) return [];
  const pct = r1(share * 100);
  return [
    makeCard({
      id: "insight:rep-range-goal",
      ruleId: "rep-range-goal",
      severity: "info",
      title: goal === "STRENGTH" ? "Most sets are in a high-rep range for a strength goal" : "Most sets are very heavy for a size goal",
      body:
        goal === "STRENGTH"
          ? `${pct}% of your working sets over the last ${INSIGHT_WINDOW_WEEKS} weeks were ${STRENGTH_GOAL_HIGH_REP_FROM}+ reps. Strength improves most with heavy loads (about 80% of 1RM or more, roughly 7 reps or fewer), so some lower-rep work would match your goal.`
          : `${pct}% of your working sets over the last ${INSIGHT_WINDOW_WEEKS} weeks were ${HYPERTROPHY_GOAL_LOW_REP_TO} reps or fewer. Muscle growth is similar from roughly 30% to 85% of 1RM when sets end near failure, so sets of about 5-30 reps make volume easier to accumulate.`,
      evidence: [
        { label: "Sets outside the goal range", value: pct, unit: "%" },
        { label: "Working sets", value: reps.length },
        { label: "Median reps", value: median(reps) },
      ],
      citations: ["schoenfeld2017load"],
    }),
  ];
};

/** 7. Relative-strength percentile against a named population (barbell lifts with norms only; null otherwise). */
const relativeStrengthPercentile: InsightRule = (input) => {
  const { sex } = input.profile;
  const bodyweightKg = latestBodyweightKg(input);
  if ((sex !== "MALE" && sex !== "FEMALE") || bodyweightKg == null) return [];
  const from = windowStart(input.today, 8);
  const cards: InsightCard[] = [];
  for (const s of buildSeries(input)) {
    const lift = s.exercise?.standardLift;
    if (!lift || s.isMachine || s.exercise?.modality !== "FREE_WEIGHT") continue;
    const recent = s.points.filter((p) => p.localDate >= from && !p.isDeload);
    if (!recent.length) continue;
    const e1rmKg = Math.max(...recent.map((p) => p.e1rmKg));
    const result = strengthPercentile({ standardLift: lift, e1rmKg, bodyweightKg, sex, ageYears: input.profile.ageYears });
    if (!result) continue;
    cards.push(
      makeCard({
        id: `insight:relative-strength-percentile:${s.seriesKey}`,
        ruleId: "relative-strength-percentile",
        severity: "info",
        title: `${s.label}: ${result.percentile}th percentile`,
        body: `Your best estimated 1RM of ${r1(e1rmKg)} kg is around the ${result.percentile}th percentile of ${result.population}. Different populations give different answers (data sets skew toward people who track their lifts), so use it for context, not as a verdict.`,
        evidence: [
          { label: "Best e1RM", value: r1(e1rmKg), unit: "kg" },
          { label: "Percentile", value: result.percentile },
          { label: "Population", value: result.population },
          { label: "Relative strength (lift / BW^0.67)", value: allometric({ liftKg: e1rmKg, bodyweightKg }) },
        ],
        citations: ["strengthlevel", "jaric2002"],
        subject: { seriesKey: s.seriesKey, exerciseId: s.exerciseId },
      }),
    );
  }
  return cards;
};

/** 8. On track vs the population curve: only when the observed and expected 80% bands do not overlap. */
const onTrackVsPopulation: InsightRule = (input) => {
  const first = firstWorkoutDate(input);
  const cards: InsightCard[] = [];
  for (const s of buildSeries(input)) {
    const standardLift = s.exercise?.standardLift ?? null;
    const cmp = compareToPopulation({
      points: s.points,
      sex: input.profile.sex,
      experience: input.profile.experience,
      standardLift,
      firstWorkoutDate: first,
      today: input.today,
    });
    if (!cmp || cmp.verdict === "on-track") continue;
    const ahead = cmp.verdict === "ahead";
    // Holding strength is the aim while losing weight, so "slower than the curve" is not a finding for that goal.
    if (!ahead && input.profile.goal === "FAT_LOSS") continue;
    cards.push(
      makeCard({
        id: `insight:on-track-vs-population:${s.seriesKey}`,
        ruleId: "on-track-vs-population",
        severity: ahead ? "celebration" : "info",
        title: ahead ? `${s.label}: ahead of the typical curve` : `${s.label}: slower than the typical curve`,
        body: `Over ${cmp.spanWeeks} weeks your best e1RM changed ${cmp.observed.pct}% (80% range ${cmp.observed.low80} to ${cmp.observed.high80}%). The typical linear-log progression curve for lifters at your training age expects ${cmp.expected.pct}% (${cmp.expected.low80} to ${cmp.expected.high80}%). The ranges do not overlap, so this is more than noise. The curve is a population average, in percent and the same for all sexes, not a target.`,
        evidence: [
          { label: "Observed change", value: cmp.observed.pct, unit: "%" },
          { label: "Expected change", value: cmp.expected.pct, unit: "%" },
          { label: "Weeks", value: cmp.spanWeeks },
        ],
        citations: ["steele2022", "latella2020", "swinton2021"],
        subject: { seriesKey: s.seriesKey, exerciseId: s.exerciseId },
      }),
    );
  }
  return cards;
};

/** 9. FFMI context, as a range because body-fat error carries through. Neutral: reference values, not verdicts. */
const ffmiContext: InsightRule = (input) => {
  const { sex, heightCm } = input.profile;
  const weightKg = latestBodyweightKg(input);
  const bf = resolveBodyFat(input.bodyMetrics.filter((m) => m.localDate <= input.today), { sex, heightCm });
  if (weightKg == null || heightCm == null || bf == null) return [];
  const result = ffmi({ weightKg, heightCm, bodyFatPct: bf.pct });
  const offset = result.normalizedFfmi - result.ffmi;
  const lo = r1(result.range.low + offset);
  const hi = r1(result.range.high + offset);
  const ref = sex === "MALE" || sex === "FEMALE" ? FFMI_REFERENCE[sex] : null;
    return [
    makeCard({
      id: "insight:ffmi-context",
      ruleId: "ffmi-context",
      severity: "info",
      title: `Normalized FFMI about ${r1(result.normalizedFfmi)}`,
      body: `With ${bf.pct}% body fat (${bf.method.replace("_", " ").toLowerCase()}) your normalized fat-free mass index is about ${r1(result.normalizedFfmi)}. Body-fat estimates are rough, so a better description is ${lo} to ${hi}.${ref ? ` For reference: ${ref.label}. These are population statistics, not a verdict on any individual.` : ""}`,
      evidence: [
        { label: "Normalized FFMI", value: r1(result.normalizedFfmi) },
        { label: "Range (body fat +-4 points)", value: `${lo}-${hi}` },
        { label: "Body fat", value: bf.pct, unit: "%" },
        { label: "Lean mass", value: r1(result.leanMassKg), unit: "kg" },
      ],
      citations: [...(ref ? [ref.citation] : []), ...(bf.method === "NAVY_TAPE" ? ["hodgdon1984"] : [])],
    }),
  ];
};

/** 10. Losing weight while strength drops: slow the cut, keep protein up. */
const cutStrengthDrop: InsightRule = (input) => {
  const trend = bodyweightTrend(bodyweightSeries(input));
  if (trend.length < 2) return [];
  const now = trend[trend.length - 1]!;
  const cutoff = addDays(input.today, -28);
  const past = [...trend].reverse().find((p) => p.localDate <= cutoff);
  if (!past) return [];
  const lossFraction = (past.trendKg - now.trendKg) / past.trendKg;
  if (lossFraction < CUT_WEIGHT_LOSS_FRACTION_4W) return [];

  const recentFrom = addDays(input.today, -27);
  const baseFrom = addDays(input.today, -55);
  let evaluated = 0;
  let dropping = 0;
  for (const s of buildSeries(input)) {
    if (s.exercise?.tracking !== "LOAD_REPS" || s.isMachine) continue;
    const live = s.points.filter((p) => !p.isDeload && p.localDate >= baseFrom && p.localDate <= input.today);
    const recent = live.filter((p) => p.localDate >= recentFrom);
    const base = live.filter((p) => p.localDate < recentFrom);
    if (recent.length < 2 || base.length < 2) continue;
    evaluated += 1;
    const change = Math.max(...recent.map((p) => p.e1rmKg)) / Math.max(...base.map((p) => p.e1rmKg)) - 1;
    if (change <= -NOISE_THRESHOLD) dropping += 1;
  }
  if (dropping < 2 || dropping * 2 < evaluated) return [];
  const weightLoss = input.profile.goal === "FAT_LOSS";
  return [
    makeCard({
      id: "insight:cut-strength-drop",
      ruleId: "cut-strength-drop",
      severity: weightLoss ? "suggestion" : "warning",
      title: weightLoss ? "Strength is dipping while you lose weight" : "Strength is dropping during the cut",
      body: weightLoss
        ? `Your goal is to lose weight and keep your muscle, so holding strength is the aim. Your bodyweight trend is down ${r1(past.trendKg - now.trendKg)} kg (${r1(lossFraction * 100)}%) over four weeks and ${dropping} of ${evaluated} free-weight lifts fell by more than the ~5% noise range. A small dip can happen, but if it keeps up, consider slowing the pace, keeping your heavy sets heavy and keeping protein around ${CUT_PROTEIN_G_PER_KG} g per kg of bodyweight per day.`
        : `Your bodyweight trend is down ${r1(past.trendKg - now.trendKg)} kg (${r1(lossFraction * 100)}%) over four weeks and ${dropping} of ${evaluated} free-weight lifts fell by more than the ~5% noise range. If keeping strength matters, consider slowing the cut and keeping protein around ${CUT_PROTEIN_G_PER_KG} g per kg of bodyweight per day.`,
      evidence: [
        { label: "Bodyweight trend change (4 wk)", value: r1(now.trendKg - past.trendKg), unit: "kg" },
        { label: "Lifts with a clear drop", value: dropping },
        { label: "Lifts compared", value: evaluated },
        { label: "Protein reference", value: CUT_PROTEIN_G_PER_KG, unit: "g/kg" },
      ],
      citations: ["grgic2020", "morton2018"],
    }),
  ];
};

/**
 * Rate of change of the smoothed bodyweight trend over `days`, in percent of the starting trend per week (negative =
 * losing). Null without a weigh-in on or before the window start, a recent weigh-in, and enough weigh-ins inside it.
 */
function weightRate(input: AnalyticsInput, days: number) {
  const series = bodyweightSeries(input);
  const trend = bodyweightTrend(series);
  if (trend.length < 2) return null;
  const now = trend[trend.length - 1]!;
  if (diffDays(now.localDate, input.today) > 7) return null;
  const cutoff = addDays(input.today, -days);
  const past = [...trend].reverse().find((p) => p.localDate <= cutoff);
  if (!past) return null;
  if (series.filter((p) => p.localDate > cutoff).length < RATE_MIN_WEIGH_INS) return null;
  const weeks = diffDays(past.localDate, now.localDate) / 7;
  if (weeks <= 0) return null;
  const changeKg = now.trendKg - past.trendKg;
  return { pctPerWeek: (changeKg / past.trendKg) * 100 / weeks, changeKg, weeks };
}

/**
 * 11. Rate of bodyweight change against ~0.5-1 % of bodyweight per week (helms2014). For a weight-loss goal: too fast,
 * on pace, or stalled. For any other goal: only when the trend is falling. Never calorie or medical advice.
 */
const weightChangeRate: InsightRule = (input) => {
  const goal = input.profile.goal;
  const evidenceFor = (rate: { pctPerWeek: number; changeKg: number; weeks: number }) => [
    { label: "Bodyweight trend rate", value: r1(rate.pctPerWeek), unit: "% per week" },
    { label: "Bodyweight trend change", value: r1(rate.changeKg), unit: "kg" },
    { label: "Weeks measured", value: r1(rate.weeks) },
    { label: "Reference pace", value: `${bandText(LOSS_RATE_TARGET_MIN_PCT_PER_WEEK, LOSS_RATE_TARGET_MAX_PCT_PER_WEEK)}% of bodyweight per week` },
  ];
  const rate = weightRate(input, RATE_WINDOW_DAYS);
  const loss = rate ? -rate.pctPerWeek : 0;
  const range = bandText(LOSS_RATE_TARGET_MIN_PCT_PER_WEEK, LOSS_RATE_TARGET_MAX_PCT_PER_WEEK);

  if (rate && loss > LOSS_RATE_TARGET_MAX_PCT_PER_WEEK) {
    return [
      makeCard({
        id: "insight:weight-change-rate",
        ruleId: "weight-change-rate",
        severity: goal === "FAT_LOSS" ? "warning" : "suggestion",
        title: "Bodyweight is falling faster than about 1% a week",
        body: `Your bodyweight trend is down ${r1(Math.abs(rate.changeKg))} kg over ${r1(rate.weeks)} weeks, about ${r1(loss)}% per week. A pace of about ${range}% of bodyweight per week is the range suggested for keeping muscle while losing weight; faster than that risks muscle and strength.${goal === "FAT_LOSS" ? " Slowing the pace is the lever to pull." : " If this is not intended, it is worth a look."}`,
        evidence: evidenceFor(rate),
        citations: ["helms2014"],
      }),
    ];
  }
  if (goal === "FAT_LOSS") {
    if (rate && loss >= LOSS_RATE_TARGET_MIN_PCT_PER_WEEK) {
      return [
        makeCard({
          id: "insight:weight-change-rate",
          ruleId: "weight-change-rate",
          severity: "celebration",
          title: "Weight is coming down at a steady pace",
          body: `Your bodyweight trend is down about ${r1(loss)}% per week over ${r1(rate.weeks)} weeks, inside the ${range}% range suggested for keeping muscle while losing weight. Keep your heavy sets heavy; holding strength is the sign it is working.`,
          evidence: evidenceFor(rate),
          citations: ["helms2014"],
        }),
      ];
    }
    const stall = weightRate(input, LOSS_STALL_WEEKS * 7);
    if (stall && -stall.pctPerWeek < LOSS_STALL_PCT_PER_WEEK) {
      return [
        makeCard({
          id: "insight:weight-change-rate",
          ruleId: "weight-change-rate",
          severity: "suggestion",
          title: "Your weight trend has been flat for about three weeks",
          body: `Your smoothed bodyweight trend moved ${r1(Math.abs(stall.pctPerWeek))}% per week over ${r1(stall.weeks)} weeks, under ${LOSS_STALL_PCT_PER_WEEK}%. Day-to-day weight swings are normal, and this uses a smoothed trend, but a flat trend this long is worth a look. Regular weigh-ins make the trend more reliable, and you can change your goal in Settings any time.`,
          evidence: evidenceFor(stall),
          citations: ["helms2014"],
        }),
      ];
    }
    return [];
  }
  if (rate && loss >= FALLING_WEIGHT_NOTICE_PCT_PER_WEEK) {
    return [
      makeCard({
        id: "insight:weight-change-rate",
        ruleId: "weight-change-rate",
        severity: "info",
        title: "Your bodyweight trend is falling",
        body: `Your bodyweight trend is down about ${r1(loss)}% per week over ${r1(rate.weeks)} weeks. If that is intended, about ${range}% of bodyweight per week is the range suggested for keeping muscle while losing weight (Helms 2014). If it is not intended, keep an eye on it. You can pick the Lose weight goal in Settings for guidance built around it.`,
        evidence: evidenceFor(rate),
        citations: ["helms2014"],
      }),
    ];
  }
  return [];
};

/** One entry per rule id, in INSIGHT_RULE_IDS order. */
export const INSIGHT_RULES: Record<InsightRuleId, InsightRule> = {
  "volume-band": volumeBand,
  "stalled-lift": stalledLift,
  "double-progression": doubleProgression,
  "effort-check": effortCheck,
  "frequency-session-cap": frequencySessionCap,
  "rep-range-goal": repRangeGoal,
  "relative-strength-percentile": relativeStrengthPercentile,
  "on-track-vs-population": onTrackVsPopulation,
  "ffmi-context": ffmiContext,
  "cut-strength-drop": cutStrengthDrop,
  "weight-change-rate": weightChangeRate,
};

/** Run all eleven rules (each may emit 0..n cards). Deterministic. */
export const runInsightRules: RunInsightRules = (input: AnalyticsInput) => INSIGHT_RULE_IDS.flatMap((id) => INSIGHT_RULES[id](input));
