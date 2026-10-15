// Weekly facts builder: AnalyticsInput -> InsightFacts (the only data the narrative model sees; CONTRACTS.md section 7).
// Pure. Numbers are rounded for display and so the narrative's numeric-grounding check can match them: kg to 0.1, % to 0.1.
import type { AnalyticsInput, SetFact } from "@/contracts/analytics";
import { INSIGHT_FACTS_VERSION, type BuildWeeklyFacts, type InsightFacts } from "@/contracts/insights";
import { addDays, diffDays, isoWeekStart } from "@/lib/dates";
import { NOISE_THRESHOLD } from "./constants";
import { forecastE1rm } from "./forecast";
import { runInsightRules } from "./insights/rules";
import { bodyweightSeries, buildSeries, firstWorkoutDate, latestBodyweightKg, r1, type SeriesInfo } from "./insights/context";
import { detectStall } from "./progression";
import { bodyweightTrend, ffmi, resolveBodyFat } from "./scores";
import { setE1rm } from "./series";
import { isHardSet, weeklyMuscleVolume } from "./volume";

const MAX_PRS = 12;
const LIFT_WINDOW_DAYS = 56;
const FORECAST_HORIZON_WEEKS = 4;

function trainingSummary(sets: SetFact[]) {
  const working = sets.filter((s) => s.setType !== "WARMUP");
  const rirs = working.flatMap((s) => (s.rir != null ? [s.rir] : []));
  return {
    sessions: new Set(sets.map((s) => s.workoutId)).size,
    trainingDays: [...new Set(sets.map((s) => s.localDate))].sort(),
    completedSets: sets.length,
    hardSets: sets.filter(isHardSet).length,
    volumeLoadKg: r1(working.reduce((sum, s) => sum + (s.effectiveLoadKg != null && s.reps != null ? s.effectiveLoadKg * s.reps : 0), 0)),
    avgRir: rirs.length ? r1(rirs.reduce((a, b) => a + b, 0) / rirs.length) : null,
    isDeloadWeek: sets.some((s) => s.isDeload),
  };
}

function liftFact(s: SeriesInfo, input: AnalyticsInput, weekEnd: string): InsightFacts["lifts"][number] {
  const recentFrom = addDays(weekEnd, -27);
  const baseFrom = addDays(weekEnd, -LIFT_WINDOW_DAYS + 1);
  const live = s.points.filter((p) => !p.isDeload && p.localDate >= baseFrom);
  const recent = live.filter((p) => p.localDate >= recentFrom);
  const base = live.filter((p) => p.localDate < recentFrom);
  const best = (ps: typeof live) => (ps.length ? Math.max(...ps.map((p) => p.e1rmKg)) : null);
  const recentBest = best(recent);
  const baseBest = best(base);
  const changePct = recentBest != null && baseBest != null ? r1((recentBest / baseBest - 1) * 100) : null;

  let bestSet: { weightKg: number; reps: number } | null = null;
  let bestE1rm = -1;
  for (const set of s.sets) {
    if (set.localDate < recentFrom || set.setType === "WARMUP" || set.setType === "DROP" || set.reps == null || set.effectiveLoadKg == null) continue;
    const e = setE1rm(set, input.profile.e1rmFormula);
    if (e != null && e > bestE1rm) {
      bestE1rm = e;
      bestSet = { weightKg: r1(set.effectiveLoadKg), reps: set.reps };
    }
  }

  const fc = forecastE1rm({
    points: s.points,
    sex: input.profile.sex,
    experience: input.profile.experience,
    standardLift: s.exercise?.standardLift ?? null,
    firstWorkoutDate: firstWorkoutDate(input),
    today: weekEnd,
    horizonWeeks: FORECAST_HORIZON_WEEKS,
  });
  const lastForecast = fc.status === "ok" ? fc.points[fc.points.length - 1]! : null;

  return {
    id: `lift:${s.seriesKey}`,
    seriesKey: s.seriesKey,
    exerciseId: s.exerciseId,
    name: (s.exercise?.name ?? "Unknown exercise").slice(0, 200),
    modality: s.exercise?.modality ?? "OTHER",
    machineLabel: s.machine ? `${s.machine.name}${s.machine.gymName ? ` @ ${s.machine.gymName}` : ""}`.slice(0, 200) : null,
    standardLift: s.exercise?.standardLift ?? null,
    e1rmKg: recentBest != null ? r1(recentBest) : null,
    e1rmChangePct4w: changePct,
    bestSet,
    sessionsLast8w: new Set(s.sets.filter((x) => x.localDate >= baseFrom && x.setType !== "WARMUP").map((x) => x.localDate)).size,
    trend: changePct == null ? "insufficient" : changePct >= NOISE_THRESHOLD * 100 ? "up" : changePct <= -NOISE_THRESHOLD * 100 ? "down" : "flat",
    stalled: detectStall(s.points, weekEnd).stalled,
    forecast: lastForecast
      ? { horizonWeeks: FORECAST_HORIZON_WEEKS, p50Kg: r1(lastForecast.p50), low80Kg: r1(lastForecast.low80), high80Kg: r1(lastForecast.high80) }
      : null,
  };
}

/** PRs set during the week against the best earlier set in the lookback window (E1RM and MAX_LOAD; a first-ever value is not a PR). */
function weekPrs(series: SeriesInfo[], weekStart: string, weekEnd: string, formula: AnalyticsInput["profile"]["e1rmFormula"]): InsightFacts["prs"] {
  const out: InsightFacts["prs"] = [];
  for (const s of series) {
    const counted = s.sets.filter((x) => x.setType !== "WARMUP" && x.setType !== "DROP" && x.reps != null && x.reps >= 1 && x.effectiveLoadKg != null);
    const measures: { type: "E1RM" | "MAX_LOAD"; value: (x: SetFact) => number | null }[] = [
      { type: "E1RM", value: (x) => setE1rm(x, formula) },
      { type: "MAX_LOAD", value: (x) => x.effectiveLoadKg },
    ];
    for (const { type, value } of measures) {
      let before = -Infinity;
      let inWeek = -Infinity;
      let achievedOn = "";
      for (const x of counted) {
        const v = value(x);
        if (v == null) continue;
        if (x.localDate < weekStart) before = Math.max(before, v);
        else if (x.localDate <= weekEnd && v > inWeek) {
          inWeek = v;
          achievedOn = x.localDate;
        }
      }
      if (before > -Infinity && inWeek > before) {
        out.push({
          id: `pr:${s.seriesKey}:${type}:0`,
          seriesKey: s.seriesKey,
          exerciseName: s.label.slice(0, 200),
          type,
          reps: 0,
          value: r1(inWeek),
          previousValue: r1(before),
          achievedOn,
        });
      }
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_PRS);
}

function bodyFacts(input: AnalyticsInput, weekEnd: string): InsightFacts["body"] {
  const weights = bodyweightSeries(input);
  const bf = resolveBodyFat(input.bodyMetrics, { sex: input.profile.sex, heightCm: input.profile.heightCm });
  if (!weights.length && !bf) return null;
  const trend = bodyweightTrend(weights);
  const now = trend[trend.length - 1];
  const past = [...trend].reverse().find((p) => p.localDate <= addDays(weekEnd, -28));
  const weightKg = weights.length ? weights[weights.length - 1]!.weightKg : null;
  const comp = bf && weightKg != null && input.profile.heightCm != null ? ffmi({ weightKg, heightCm: input.profile.heightCm, bodyFatPct: bf.pct }) : null;
  return {
    id: "body",
    weightKg: weightKg != null ? r1(weightKg) : null,
    weightTrendKg: now ? r1(now.trendKg) : null,
    weightChangeKg4w: now && past ? r1(now.trendKg - past.trendKg) : null,
    bodyFatPct: bf ? r1(bf.pct) : null,
    bodyFatMethod: bf ? bf.method : null,
    ffmi: comp ? r1(comp.ffmi) : null,
    normalizedFfmi: comp ? r1(comp.normalizedFfmi) : null,
  };
}

/**
 * Facts for the ISO week starting `weekStart`. Everything after the week's Sunday is ignored, and the rules run as of the
 * following Monday so they judge exactly this week.
 */
export const buildWeeklyFacts: BuildWeeklyFacts = (input, opts) => {
  const weekStart = isoWeekStart(opts.weekStart);
  const weekEnd = addDays(weekStart, 6);
  const scoped: AnalyticsInput = {
    ...input,
    today: weekEnd,
    sets: input.sets.filter((s) => s.localDate <= weekEnd),
    bodyMetrics: input.bodyMetrics.filter((m) => m.localDate <= weekEnd),
  };
  const prevStart = addDays(weekStart, -7);
  const weekSets = scoped.sets.filter((s) => s.localDate >= weekStart);
  const prevSets = scoped.sets.filter((s) => s.localDate >= prevStart && s.localDate < weekStart);
  const training = trainingSummary(weekSets);
  const prev = trainingSummary(prevSets);

  const goal = input.profile.goal;
  const volumeNow = weeklyMuscleVolume({ sets: scoped.sets, exercises: input.exercises, weekStart, goal });
  const volumePrev = new Map(weeklyMuscleVolume({ sets: scoped.sets, exercises: input.exercises, weekStart: prevStart, goal }).map((v) => [v.muscle, v.fractionalSets]));

  const series = buildSeries(scoped);
  const liftFrom = addDays(weekEnd, -LIFT_WINDOW_DAYS + 1);
  const first = firstWorkoutDate(scoped);
  const bodyweightKg = latestBodyweightKg(scoped);
  const bf = resolveBodyFat(scoped.bodyMetrics, { sex: input.profile.sex, heightCm: input.profile.heightCm });

  return {
    version: INSIGHT_FACTS_VERSION,
    weekStart,
    weekEnd,
    timezone: input.profile.timezone,
    displayUnit: input.profile.unitPreference,
    lifter: {
      id: "lifter",
      sex: input.profile.sex,
      ageYears: input.profile.ageYears,
      heightCm: input.profile.heightCm,
      experience: input.profile.experience,
      goal,
      bodyweightKg: bodyweightKg != null ? r1(bodyweightKg) : null,
      bodyFatPct: bf ? r1(bf.pct) : null,
      weeksTraining: first ? Math.floor(diffDays(first, weekEnd) / 7) : null,
    },
    training: {
      id: "training",
      ...training,
      sessionsPrevWeek: prev.sessions,
      hardSetsPrevWeek: prev.hardSets,
    },
    volume: volumeNow.map((v) => ({
      id: `volume:${v.muscle}`,
      muscle: v.muscle,
      fractionalSets: v.fractionalSets,
      priorWeekFractionalSets: volumePrev.get(v.muscle) ?? null,
      bandLow: v.band.low,
      bandHigh: v.band.high,
      status: v.status,
    })),
    lifts: series.filter((s) => s.sets.some((x) => x.localDate >= liftFrom)).map((s) => liftFact(s, scoped, weekEnd)),
    prs: weekPrs(series, weekStart, weekEnd, input.profile.e1rmFormula),
    body: bodyFacts(scoped, weekEnd),
    insights: runInsightRules({ ...scoped, today: addDays(weekEnd, 1) }),
  };
};
