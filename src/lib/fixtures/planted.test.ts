// The planted signals of the main fixture lifter must be detected by the analytics (acceptance criterion 4).
import { describe, expect, it } from "vitest";
import { forecastE1rm } from "@/lib/analytics/forecast";
import { buildSeries } from "@/lib/analytics/insights/context";
import { runInsightRules } from "@/lib/analytics/insights/rules";
import { detectStall, suggestProgression } from "@/lib/analytics/progression";
import { bodyweightTrend, resolveBodyFat } from "@/lib/analytics/scores";
import { sessionBestE1rm } from "@/lib/analytics/series";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import { weeklyMuscleVolume } from "@/lib/analytics/volume";
import { insightFactsSchema } from "@/contracts/insights";
import { generateLifterRows } from "./generate";

const rows = generateLifterRows();
const { input } = rows;
const planted = rows.planted!;
const series = (key: string) => buildSeries(input).find((s) => s.seriesKey === key)!;
const fc = (key: string, withDeloads = false) => {
  const s = series(key);
  const points = withDeloads ? s.points.map((p) => ({ ...p, isDeload: false })) : s.points;
  return forecastE1rm({ points, sex: "MALE", experience: "INTERMEDIATE", standardLift: s.exercise?.standardLift ?? null, firstWorkoutDate: "2026-06-22", today: input.today });
};

describe("planted signals", () => {
  it("bench press: stalled", () => {
    const stall = detectStall(series(planted.benchStall.seriesKey).points, input.today);
    expect(stall.stalled).toBe(true);
    expect(Math.abs(stall.changePct!)).toBeLessThan(5);
    expect(runInsightRules(input).some((c) => c.id === `insight:stalled-lift:${planted.benchStall.seriesKey}`)).toBe(true);
  });
  it("squat: steadily progressing, not stalled, forecast is rising", () => {
    const s = series(planted.squatProgressing.seriesKey);
    const stall = detectStall(s.points, input.today);
    expect(stall.stalled).toBe(false);
    expect(stall.changePct).toBeGreaterThan(5);
    const f = fc(planted.squatProgressing.seriesKey);
    if (f.status !== "ok") throw new Error("expected a squat forecast");
    expect(f.points.at(-1)!.p50).toBeGreaterThan(s.points.at(-1)!.e1rmKg);
    expect(runInsightRules(input).some((c) => c.id === `insight:stalled-lift:${planted.squatProgressing.seriesKey}`)).toBe(false);
  });
  it("leg press at two gyms: two machine profiles, two series, never merged or compared", () => {
    const { gymA, gymB } = planted.legPress;
    expect(gymA.seriesKey).not.toBe(gymB.seriesKey);
    const a = series(gymA.seriesKey);
    const b = series(gymB.seriesKey);
    expect(a.sets.every((s) => s.machineProfileId === gymA.machineProfileId)).toBe(true);
    expect(b.sets.every((s) => s.machineProfileId === gymB.machineProfileId)).toBe(true);
    expect(a.points.length).toBeGreaterThan(5);
    expect(b.points.length).toBeGreaterThanOrEqual(6);
    // the second gym's numbers are not comparable: they start well below where the first gym ended
    expect(b.points[0]!.e1rmKg).toBeLessThan(a.points.filter((p) => !p.isDeload).at(-1)!.e1rmKg * 0.9);
    // sessionBestE1rm on a mixed input still never merges
    const mixed = sessionBestE1rm([...a.sets, ...b.sets]);
    expect(new Set(mixed.map((p) => p.seriesKey))).toEqual(new Set([gymA.seriesKey, gymB.seriesKey]));
    // the second gym has enough sessions for its own forecast; the abandoned first gym reads as a layoff
    expect(fc(gymB.seriesKey).status).toBe("ok");
    expect(fc(gymA.seriesKey)).toMatchObject({ status: "insufficient", reason: "layoff" });
    // no percentile/DOTS data is ever attached to a machine series: the percentile rule skips it
    expect(runInsightRules(input).some((c) => c.ruleId === "relative-strength-percentile")).toBe(false);
  });
  it("deload week: flagged on the workouts and excluded from the forecast and stall detection", () => {
    const squat = series(planted.squatProgressing.seriesKey);
    const deloadPoints = squat.points.filter((p) => planted.deload.dates.includes(p.localDate));
    expect(deloadPoints).toHaveLength(1);
    expect(deloadPoints[0]!.isDeload).toBe(true);
    expect(deloadPoints[0]!.e1rmKg).toBeLessThan(squat.points.at(-1)!.e1rmKg * 0.75);
    const f = fc(planted.squatProgressing.seriesKey);
    if (f.status !== "ok") throw new Error("expected ok");
    expect(f.model.excluded.deload).toBe(1);
    expect(f.model.usedSessions).toBe(squat.points.length - 1);
    // with the deload left in, the fit would be dragged down
    const polluted = fc(planted.squatProgressing.seriesKey, true);
    if (polluted.status !== "ok") throw new Error("expected ok");
    expect(polluted.model.usedSessions).toBeLessThanOrEqual(f.model.usedSessions);
  });
  it("pin-labelled leg curl: selectorized series in lb, 2-for-2 reached but the 10 lb pin is > 10%: add reps first", () => {
    const s = series(planted.legCurl.seriesKey);
    const machine = rows.machineProfiles.find((m) => m.id === planted.legCurl.machineProfileId)!;
    expect(machine).toMatchObject({ labelUnit: "LB", pinStepKg: planted.legCurl.pinStepKg });
    const current = s.sets.filter((x) => !x.isDeload).at(-1)!.effectiveLoadKg!;
    const sug = suggestProgression({ sets: s.sets.filter((x) => !x.isDeload), repMin: 8, repMax: 12, modality: "MACHINE", incrementKg: machine.pinStepKg!, currentLoadKg: current });
    expect(sug.kind).toBe(planted.legCurl.progression);
    expect(planted.legCurl.pinStepKg / current).toBeGreaterThan(0.1);
    expect(runInsightRules(input).find((c) => c.ruleId === "double-progression")?.title).toContain("add reps before the next jump");
  });
  it("weighted pull-ups: effective load follows bodyweight (BODYWEIGHT_PLUS)", () => {
    const s = series(planted.weightedPullUps.seriesKey);
    expect(s.exercise!.loadType).toBe("BODYWEIGHT_PLUS");
    for (const set of s.sets.filter((x) => !x.isDeload)) {
      expect(set.effectiveLoadKg).toBeCloseTo(set.workoutBodyweightKg! + set.weightKg!, 2);
    }
  });
  it("weight cut with tape: bodyweight trend falls, body fat comes from the tape measurements", () => {
    const trend = bodyweightTrend(input.bodyMetrics.flatMap((m) => (m.weightKg != null ? [{ localDate: m.localDate, weightKg: m.weightKg }] : [])));
    expect(trend[0]!.trendKg - trend.at(-1)!.trendKg).toBeGreaterThan(3);
    const early = resolveBodyFat(input.bodyMetrics.slice(0, 6), input.profile)!;
    const late = resolveBodyFat(input.bodyMetrics, input.profile)!;
    expect(early.method).toBe("NAVY_TAPE");
    expect(late.pct).toBeLessThan(early.pct - 2);
    expect(runInsightRules(input).some((c) => c.ruleId === "ffmi-context")).toBe(true);
  });
  it("volume: quadriceps are below the band for the last week; chest, hamstrings and biceps are within", () => {
    const vol = weeklyMuscleVolume({ sets: input.sets, exercises: input.exercises, weekStart: "2026-10-05", goal: "HYPERTROPHY" });
    const status = (m: string) => vol.find((v) => v.muscle === m)!.status;
    expect(status("QUADRICEPS")).toBe("below");
    expect(["CHEST", "HAMSTRINGS", "BICEPS"].map(status)).toEqual(["within", "within", "within"]);
  });
  it("facts for the last week validate against the schema", () => {
    expect(insightFactsSchema.safeParse(buildWeeklyFacts(input, { weekStart: "2026-10-05" })).success).toBe(true);
  });
});
