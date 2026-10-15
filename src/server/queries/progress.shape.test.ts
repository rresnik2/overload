import { describe, expect, it } from "vitest";
import { generateEdgeCaseUser, generateLifterRows } from "@/lib/fixtures/generate";
import {
  buildBigThree,
  buildExerciseProgress,
  buildHeatmap,
  buildOverview,
  buildSeriesRefs,
  markPrs,
  topSetPoints,
  volumePoints,
} from "./progress.shape";

const rows = generateLifterRows();
const { input } = rows;
const planted = rows.planted!;
const exerciseOf = (key: string) => input.exercises.find((e) => key.startsWith(e.id))!;

function progressFor(seriesKey: string) {
  const exercise = exerciseOf(seriesKey);
  return buildExerciseProgress({
    exercise,
    machineProfiles: input.machineProfiles,
    sets: input.sets.filter((s) => s.exerciseId === exercise.id),
    selectedKey: seriesKey,
    profile: input.profile,
    today: input.today,
    firstWorkoutDate: "2026-06-22",
    bodyweightKg: 82,
  });
}

/** Every value in the output is plain JSON: no Decimal-like objects, no userId anywhere. */
function assertPlain(value: unknown, path = "$"): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
  if (Array.isArray(value)) return value.forEach((v, i) => assertPlain(v, `${path}[${i}]`));
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    expect(proto === Object.prototype || proto === null, `${path} is a plain object`).toBe(true);
    for (const [k, v] of Object.entries(value)) {
      expect(k, `${path}.${k}`).not.toBe("userId");
      assertPlain(v, `${path}.${k}`);
    }
    return;
  }
  throw new Error(`${path}: unexpected ${typeof value}`);
}

describe("series refs and the machine picker", () => {
  it("keeps the two leg-press gyms as separate series", () => {
    const { gymA, gymB } = planted.legPress;
    const leg = exerciseOf(gymA.seriesKey);
    const refs = buildSeriesRefs(leg, input.machineProfiles, input.sets);
    expect(refs.map((r) => r.seriesKey).sort()).toEqual([gymA.seriesKey, gymB.seriesKey].sort());
    expect(new Set(refs.map((r) => r.label)).size).toBe(2);
    expect(refs.every((r) => r.machineProfileId !== null && r.modality === "MACHINE")).toBe(true);
  });

  it("a series' charts only use that series' sets, even when the caller passes the whole exercise", () => {
    const { gymA, gymB } = planted.legPress;
    const a = progressFor(gymA.seriesKey).selected!;
    const b = progressFor(gymB.seriesKey).selected!;
    expect(a.ref.seriesKey).toBe(gymA.seriesKey);
    expect(b.ref.seriesKey).toBe(gymB.seriesKey);
    const datesA = new Set(a.e1rm.map((p) => p.localDate));
    const datesB = new Set(b.e1rm.map((p) => p.localDate));
    expect([...datesA].filter((d) => datesB.has(d))).toEqual([]); // gym B starts when gym A stops
    expect(a.latestE1rmKg).not.toBe(b.latestE1rmKg);
  });

  it("falls back to the most recently trained series when the requested key is unknown", () => {
    const { gymA, gymB } = planted.legPress;
    const exercise = exerciseOf(gymA.seriesKey);
    const out = buildExerciseProgress({
      exercise, machineProfiles: input.machineProfiles, sets: input.sets.filter((s) => s.exerciseId === exercise.id),
      selectedKey: "does-not-exist", profile: input.profile, today: input.today, firstWorkoutDate: null, bodyweightKg: null,
    });
    expect(out.selected?.ref.seriesKey).toBe(gymB.seriesKey);
    expect(out.series).toHaveLength(2);
  });
});

describe("forecast view", () => {
  it("long series: status ok with 50/80 bands, never beyond 12 weeks, deload left out", () => {
    const sq = progressFor(planted.squatProgressing.seriesKey).selected!;
    expect(sq.forecast.status).toBe("ok");
    if (sq.forecast.status !== "ok") return;
    expect(sq.forecast.points.length).toBeLessThanOrEqual(12);
    for (const p of sq.forecast.points) {
      expect(p.low80).toBeLessThanOrEqual(p.low50);
      expect(p.low50).toBeLessThanOrEqual(p.p50);
      expect(p.p50).toBeLessThanOrEqual(p.high50);
      expect(p.high50).toBeLessThanOrEqual(p.high80);
    }
    expect(sq.forecast.excluded.deload).toBeGreaterThanOrEqual(1);
    const deloadSessions = sq.e1rm.filter((p) => p.isDeload).length;
    expect(deloadSessions).toBeGreaterThanOrEqual(1);
    expect(sq.forecast.usedSessions).toBe(sq.e1rm.length - deloadSessions - sq.forecast.excluded.outliers);
  });

  it("short series: insufficient with the counts the UI prints", () => {
    const curl = progressFor(planted.legCurl.seriesKey).selected!;
    expect(curl.forecast.status).toBe("insufficient");
    if (curl.forecast.status !== "insufficient") return;
    expect(curl.forecast.needSessions).toBe(6);
    expect(curl.forecast.haveSessions).toBeLessThan(6);
  });

  it("a brand-new user has no series and no forecast", () => {
    const edge = generateEdgeCaseUser("brand-new").input;
    expect(buildOverview({ today: edge.today, profile: edge.profile, exercises: edge.exercises, machineProfiles: edge.machineProfiles, sets: edge.sets, bodyweightKg: null }).cards).toEqual([]);
  });
});

describe("chart series", () => {
  it("marks only strict new bests as records (the first session is not one)", () => {
    const out = markPrs([
      { localDate: "2026-01-01", e1rmKg: 100, seriesKey: "x", isDeload: false },
      { localDate: "2026-01-08", e1rmKg: 105, seriesKey: "x", isDeload: false },
      { localDate: "2026-01-15", e1rmKg: 105, seriesKey: "x", isDeload: false },
      { localDate: "2026-01-22", e1rmKg: 103, seriesKey: "x", isDeload: false },
      { localDate: "2026-01-29", e1rmKg: 107, seriesKey: "x", isDeload: false },
    ]);
    expect(out.map((p) => p.isPr)).toEqual([false, true, false, false, true]);
  });

  it("top set is the heaviest working set per day; volume skips warm-ups", () => {
    const sets = input.sets.filter((s) => s.seriesKey === planted.squatProgressing.seriesKey);
    const tops = topSetPoints(sets);
    expect(tops.length).toBe(new Set(sets.filter((s) => s.setType !== "WARMUP").map((s) => s.localDate)).size);
    const day = tops[0]!;
    const heaviest = Math.max(...sets.filter((s) => s.localDate === day.localDate && s.setType !== "WARMUP").map((s) => s.effectiveLoadKg ?? 0));
    expect(day.weightKg).toBe(heaviest);
    const vol = volumePoints(sets);
    const manual = sets.filter((s) => s.localDate === vol[0]!.localDate && s.setType !== "WARMUP").reduce((t, s) => t + (s.effectiveLoadKg ?? 0) * (s.reps ?? 0), 0);
    expect(vol[0]!.volumeKg).toBeCloseTo(manual, 0);
  });
});

describe("overview", () => {
  const overview = buildOverview({
    today: input.today, profile: input.profile, exercises: input.exercises, machineProfiles: input.machineProfiles, sets: input.sets, bodyweightKg: 82,
  });

  it("one card per series, with the two leg presses separate", () => {
    const keys = new Set(input.sets.map((s) => s.seriesKey));
    expect(overview.cards).toHaveLength(keys.size);
    expect(overview.cards.filter((c) => c.exerciseName === "Leg Press")).toHaveLength(2);
  });

  it("the heatmap covers 16 ISO weeks Monday to Sunday and counts the same sets", () => {
    expect(overview.heatmap.weeks).toHaveLength(16);
    for (const w of overview.heatmap.weeks) {
      expect(w.cells).toHaveLength(7);
      expect(new Date(`${w.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    const working = input.sets.filter((s) => s.setType !== "WARMUP").length;
    expect(overview.heatmap.totalSets).toBe(working);
    expect(overview.heatmap.trainingDays).toBe(new Set(input.sets.filter((s) => s.setType !== "WARMUP").map((s) => s.localDate)).size);
    expect(buildHeatmap([], input.today).totalSets).toBe(0);
  });

  it("weekly volume is for the current and the previous ISO week", () => {
    expect(overview.weeks).toHaveLength(2);
    expect(overview.weeks[0]!.weekStart > overview.weeks[1]!.weekStart).toBe(true);
    for (const w of overview.weeks) for (const m of w.muscles) expect(m.band.low).toBeLessThan(m.band.high);
  });

  it("DOTS only from barbell squat + bench + deadlift: the fixture has no deadlift, so no score", () => {
    expect(overview.bigThree.dots).toBeNull();
    expect(overview.bigThree.totalKg).toBeNull();
    expect(overview.bigThree.lifts.find((l) => l.standardLift === "SQUAT")?.e1rmKg).toBeGreaterThan(0);
  });

  it("a full big three scores DOTS (never from machine sets)", () => {
    const ex = (standardLift: "SQUAT" | "BENCH_PRESS" | "DEADLIFT", id: string) => ({ ...input.exercises[0]!, id, standardLift, modality: "FREE_WEIGHT" as const });
    const exercises = [ex("SQUAT", "s"), ex("BENCH_PRESS", "b"), ex("DEADLIFT", "d")];
    const set = (id: string, kg: number) => ({ ...input.sets[0]!, id: `${id}-set`, exerciseId: id, machineProfileId: null, seriesKey: id, setType: "NORMAL" as const, reps: 1, rir: null, e1rmKg: kg, effectiveLoadKg: kg });
    const big = buildBigThree(exercises, [set("s", 180), set("b", 120), set("d", 220)], { ...input.profile, sex: "MALE" }, 90);
    expect(big.totalKg).toBe(520);
    expect(big.dots).toBeGreaterThan(300);
    // the same sets logged on a machine profile never count
    const onMachine = [set("s", 180), set("b", 120), set("d", 220)].map((s) => ({ ...s, machineProfileId: "m1" }));
    expect(buildBigThree(exercises, onMachine, { ...input.profile, sex: "MALE" }, 90).totalKg).toBeNull();
  });

  it("machine series never carry a percentile, and with no norms embedded nobody does", () => {
    for (const card of overview.cards) {
      const p = progressFor(card.ref.seriesKey).selected!;
      expect(p.strength.percentile).toBeNull();
    }
  });

  it("is plain data: no Decimal, no userId", () => {
    assertPlain(overview);
    assertPlain(progressFor(planted.squatProgressing.seriesKey));
    assertPlain(progressFor(planted.legCurl.seriesKey));
  });
});
