// Deterministic fixture histories for streams F and G (charts, insights, demo user) and for the analytics tests.
// PURE: seeded PRNG, no clock (`today` is an option), nothing from src/server. The same options always give the same output.
//
// The main lifter (`generateLifterHistory`) is a 16-week intermediate with PLANTED signals (see `PlantedSignals`):
//   - a deload week (week 9 of 16): every workout that week has isDeload = true and ~60% loads
//   - a bench-press stall: e1RM rises for 5 weeks, then stays flat (inside the ~5% noise) for 10 weeks
//   - a steadily progressing squat (about +1.5%/week)
//   - leg press at TWO gyms (two machine profiles -> two series that never merge), with different numbers
//   - a pin-labelled selectorized leg curl (labelUnit LB, 10 lb pins) that ends at a 2-for-2 with a >10% stack jump
//   - weighted pull-ups (BODYWEIGHT_PLUS: effective load follows bodyweight)
//   - a weight cut (about 0.6 kg/week from week 7) with Navy tape measurements (no stored body-fat %)
// Edge-case users: `generateEdgeCaseUser(kind)`.
import type { AnalyticsInput, BodyMetricFact, ExerciseMeta, MachineProfileMeta, ProfileFact, SetFact } from "@/contracts/analytics";
import type { SetType, Sex, WeightUnit } from "@/contracts/enums";
import { addDays, ageInYears, isoWeekStart, zonedTimeToUtc } from "@/lib/dates";
import { seriesKey } from "@/lib/ids";
import { estimate1RM } from "@/lib/analytics/e1rm";
import { effectiveLoadKg } from "@/lib/analytics/load";
import { kgToLb, round, toKg } from "@/lib/units";
import { FIXTURE_EXERCISE_LIST, FIXTURE_EXERCISES, type FixtureExerciseKey } from "./exercises";
import { createRng, fixtureId, type Rng } from "./prng";

export const FIXTURE_TIMEZONE = "America/New_York";
/** A Sunday: the default "today" of every fixture. */
export const FIXTURE_TODAY = "2026-10-11";
export const FIXTURE_WEEKS = 16;
/** 0-based index of the planted deload week within the 16 weeks. */
export const DELOAD_WEEK_INDEX = 8;
/** First week (0-based) of the planted bench plateau and of the weight cut. */
export const BENCH_PLATEAU_FROM_WEEK = 5;
export const CUT_FROM_WEEK = 6;
export const CUT_KG_PER_WEEK = 0.6;
export const LEG_PRESS_GYM_B_FROM_WEEK = 9;

export const FIXTURE_DEMO_EMAIL = "demo@overload.test";

// ───────────────────────────── types ─────────────────────────────

export interface FixtureSet {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  inputUnit: WeightUnit;
  reps: number;
  rir: number | null;
  completedAt: string;
}

export interface FixtureWorkoutExercise {
  id: string;
  exerciseId: string;
  machineProfileId: string | null;
  position: number;
  sets: FixtureSet[];
}

export interface FixtureWorkout {
  id: string;
  title: string;
  localDate: string;
  startedAt: string;
  endedAt: string;
  timezone: string;
  bodyweightKg: number | null;
  isDeload: boolean;
  exercises: FixtureWorkoutExercise[];
}

export interface FixtureBodyMetric {
  id: string;
  measuredAt: string;
  localDate: string;
  weightKg: number | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
}

export interface FixtureMachineProfile extends MachineProfileMeta {
  notes: string | null;
}

export interface PlantedSignals {
  /** Monday of the deload week and the dates of its workouts. */
  deload: { weekStart: string; dates: string[] };
  benchStall: { seriesKey: string; stalled: true; plateauFromWeek: number };
  squatProgressing: { seriesKey: string; stalled: false };
  legPress: { gymA: { seriesKey: string; machineProfileId: string }; gymB: { seriesKey: string; machineProfileId: string } };
  legCurl: { seriesKey: string; machineProfileId: string; labelUnit: "LB"; pinStepKg: number; progression: "add_reps" };
  weightedPullUps: { seriesKey: string };
  weightCut: { startDate: string; kgPerWeek: number; tapeDates: string[] };
}

export interface FixtureHistory {
  userKey: string;
  today: string;
  profile: ProfileFact;
  /** Everything the rule engine reads. */
  input: AnalyticsInput;
  exercises: ExerciseMeta[];
  machineProfiles: FixtureMachineProfile[];
  workouts: FixtureWorkout[];
  bodyMetrics: FixtureBodyMetric[];
  planted: PlantedSignals | null;
}

export interface LifterOptions {
  /** PRNG seed (default 20260101). */
  seed?: number;
  /** The user's local date; the history ends here (default FIXTURE_TODAY). */
  today?: string;
  /** Weeks of history (default 16, ISO weeks ending with the week of `today`). */
  weeks?: number;
  /** Namespaces the row ids so several fixture users can share one database (default "demo"). */
  userKey?: string;
  /** Also drop strength during the cut (squat/bench/row/press fall ~4% a week from the deload on): fires cut-strength-drop. */
  strengthDropDuringCut?: boolean;
}

export type EdgeCaseKind = "brand-new" | "one-session" | "layoff" | "mixed-units" | "no-bodyweight" | "prefer-not-to-say";
export const EDGE_CASE_KINDS: readonly EdgeCaseKind[] = ["brand-new", "one-session", "layoff", "mixed-units", "no-bodyweight", "prefer-not-to-say"];

// ───────────────────────────── engine ─────────────────────────────

interface Config {
  userKey: string;
  seed: number;
  today: string;
  weeks: number;
  profile: ProfileFact;
  includeSession: (week: number, dayIndex: number) => boolean;
  withBodyweight: boolean;
  mixedUnits: boolean;
  strengthDrop: boolean;
  planted: boolean;
}

interface Machines {
  legPressA: FixtureMachineProfile;
  legPressB: FixtureMachineProfile;
  legCurl: FixtureMachineProfile;
}

const LEG_CURL_PIN_KG = toKg(10, "LB");

function machinesFor(userKey: string): Machines {
  const mk = (key: string, p: Omit<FixtureMachineProfile, "id">): FixtureMachineProfile => ({ id: fixtureId(`${userKey}:machine:${key}`), ...p });
  return {
    legPressA: mk("leg-press-a", {
      name: "Plate-loaded leg press", gymName: "Home Gym", brand: "Hammer Strength", exerciseId: FIXTURE_EXERCISES.legPress.meta.id,
      labelUnit: "KG", pinStepKg: null, baseLoadKg: 40, notes: "45-degree sled; base load is the carriage",
    }),
    legPressB: mk("leg-press-b", {
      name: "Plate-loaded leg press", gymName: "Riverside Fitness", brand: "Life Fitness", exerciseId: FIXTURE_EXERCISES.legPress.meta.id,
      labelUnit: "KG", pinStepKg: null, baseLoadKg: 0, notes: "Feels lighter than the home machine",
    }),
    legCurl: mk("leg-curl", {
      name: "Selectorized lying leg curl", gymName: "Home Gym", brand: "Life Fitness", exerciseId: FIXTURE_EXERCISES.legCurl.meta.id,
      labelUnit: "LB", pinStepKg: LEG_CURL_PIN_KG, baseLoadKg: null, notes: "Pin labels are in pounds, 10 lb per pin",
    }),
  };
}

interface Draft {
  setType: SetType;
  weightKg: number | null;
  unit: WeightUnit;
  reps: number;
  rir: number | null;
}

interface Block {
  key: FixtureExerciseKey;
  machine: FixtureMachineProfile | null;
  sets: Draft[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** True e1RM trajectories (kg) by week: the planted signals live here. */
function trueE1rm(key: FixtureExerciseKey, week: number, strengthDrop: boolean): number {
  const w = week;
  let v: number;
  switch (key) {
    case "squat": v = 108 + 1.9 * w; break;
    case "bench": v = w <= BENCH_PLATEAU_FROM_WEEK ? 92 + 2.2 * w : 92 + 2.2 * BENCH_PLATEAU_FROM_WEEK; break;
    case "row": v = 85 + 1.0 * w; break;
    case "ohp": v = 58 + 0.9 * w; break;
    case "inclineDb": v = 70 + 1.2 * w; break;
    case "curl": v = 45 + 0.5 * w; break;
    case "legPress": v = week < LEG_PRESS_GYM_B_FROM_WEEK ? 230 + 7 * w : 205 + 6 * (w - LEG_PRESS_GYM_B_FROM_WEEK); break;
    default: v = 100;
  }
  const dropsWithCut = key === "squat" || key === "bench" || key === "row" || key === "ohp";
  if (strengthDrop && dropsWithCut && w > DELOAD_WEEK_INDEX - 1) v *= 1 - 0.04 * (w - (DELOAD_WEEK_INDEX - 1));
  return v;
}

function trueBodyweight(week: number): number {
  return week < CUT_FROM_WEEK ? 86 : 86 - CUT_KG_PER_WEEK * (week - CUT_FROM_WEEK + 1);
}

interface TrainSpec {
  key: FixtureExerciseKey;
  machine?: FixtureMachineProfile | null;
  week: number;
  nSets: number;
  /** Fraction of the session e1RM used as the working load. */
  frac: number;
  /** Load rounding step in the entry unit (kg). */
  step: number;
  rirs: number[];
  warmups?: boolean;
  drop?: boolean;
}

function toEntry(kg: number, unit: WeightUnit): { weightKg: number; unit: WeightUnit } {
  if (unit === "KG") return { weightKg: round(kg, 3), unit };
  return { weightKg: toKg(Math.round(kgToLb(kg) / 5) * 5, "LB"), unit };
}

function train(rng: Rng, cfg: Config, spec: TrainSpec, deload: boolean, unit: WeightUnit, bodyweightKg: number | null): Block {
  const meta = FIXTURE_EXERCISES[spec.key].meta;
  const machine = spec.machine ?? null;
  const e1Session = trueE1rm(spec.key, spec.week, cfg.strengthDrop) * (1 + 0.015 * rng.gaussian()) * (deload ? 0.6 : 1);
  const target = spec.frac * e1Session;

  let entryKg: number;
  switch (meta.loadType) {
    case "PER_IMPLEMENT": entryKg = Math.round(target / 2 / spec.step) * spec.step; break;
    case "PLATES_PER_SIDE": entryKg = Math.round((target - (machine?.baseLoadKg ?? 0)) / 2 / spec.step) * spec.step; break;
    default: entryKg = Math.round(target / spec.step) * spec.step;
  }
  const { weightKg, unit: inputUnit } = toEntry(entryKg, unit);
  const eff = effectiveLoadKg({ loadType: meta.loadType, weightKg, isUnilateral: meta.isUnilateral, bodyweightKg, bodyweightFactor: meta.bodyweightFactor, baseLoadKg: machine?.baseLoadKg ?? null }) ?? weightKg;

  const sets: Draft[] = [];
  if (spec.warmups) {
    sets.push({ setType: "WARMUP", weightKg: toEntry(entryKg * 0.5, unit).weightKg, unit: inputUnit, reps: 5, rir: null });
    sets.push({ setType: "WARMUP", weightKg: toEntry(entryKg * 0.7, unit).weightKg, unit: inputUnit, reps: 3, rir: null });
  }
  const nSets = deload ? Math.max(2, spec.nSets - 1) : spec.nSets;
  for (let i = 0; i < nSets; i++) {
    const rir = spec.rirs[Math.min(i, spec.rirs.length - 1)]!;
    const e1 = e1Session * (1 - 0.012 * i) * (1 + 0.005 * rng.gaussian());
    const reps = clamp(Math.round((e1 / eff - 1) * 30 - rir), 1, 12 - rir);
    sets.push({ setType: "WORKING", weightKg, unit: inputUnit, reps, rir });
  }
  if (spec.drop) {
    sets.push({ setType: "DROP", weightKg: toEntry(entryKg * 0.7, unit).weightKg, unit: inputUnit, reps: 12, rir: 0 });
  }
  return { key: spec.key, machine, sets };
}

function pullUps(rng: Rng, week: number, nSets: number, deload: boolean): Block {
  const addedKg = deload ? 0 : Math.round((5 + 1.5 * week) / 2.5) * 2.5;
  const sets: Draft[] = [];
  for (let i = 0; i < nSets; i++) {
    sets.push({ setType: "WORKING", weightKg: addedKg, unit: "KG", reps: Math.max(4, 8 - i + rng.int(0, 1)), rir: 1 });
  }
  return { key: "pullUp", machine: null, sets };
}

function legCurl(week: number, sessionsAtLoad: number, machine: FixtureMachineProfile, deload: boolean): Block {
  const lb = week < 5 ? 70 : week < 11 ? 80 : 90;
  const reps = Math.min(14, 10 + sessionsAtLoad);
  const weightKg = toKg(deload ? lb - 20 : lb, "LB");
  const sets: Draft[] = [];
  for (let i = 0; i < 4; i++) sets.push({ setType: "WORKING", weightKg, unit: "LB", reps: reps + (i < 3 ? Math.min(1, 3 - i) : 0), rir: 1 });
  return { key: "legCurl", machine, sets };
}

const DAY_LABELS = ["Lower A", "Upper A", "Lower B", "Upper B"] as const;
/** Weekday offsets from Monday: Mon, Tue, Thu, Fri. */
const DAY_OFFSETS = [0, 1, 3, 4] as const;

function buildHistory(cfg: Config): FixtureHistory {
  const rng = createRng(cfg.seed);
  const machines = machinesFor(cfg.userKey);
  const week0 = addDays(isoWeekStart(cfg.today), -7 * (cfg.weeks - 1));
  const tz = FIXTURE_TIMEZONE;
  const workouts: FixtureWorkout[] = [];
  const bodyMetrics: FixtureBodyMetric[] = [];
  const curlSessionsAtLoad = new Map<number, number>();

  for (let week = 0; week < cfg.weeks; week++) {
    const monday = addDays(week0, 7 * week);
    const deload = week === DELOAD_WEEK_INDEX;
    const bw = trueBodyweight(week);

    if (cfg.withBodyweight) {
      for (const d of [0, 2, 4]) {
        const localDate = addDays(monday, d);
        if (localDate > cfg.today) continue;
        bodyMetrics.push({ id: fixtureId(`${cfg.userKey}:bm:${localDate}`), measuredAt: zonedTimeToUtc(localDate, 7, 0, tz).toISOString(), localDate, weightKg: round(bw + 0.35 * rng.gaussian(), 1), neckCm: null, waistCm: null, hipCm: null });
      }
      const tapeDate = addDays(monday, 5);
      if (week % 2 === 0 && tapeDate <= cfg.today) {
        bodyMetrics.push({
          id: fixtureId(`${cfg.userKey}:bm:${tapeDate}:tape`),
          measuredAt: zonedTimeToUtc(tapeDate, 8, 0, tz).toISOString(),
          localDate: tapeDate,
          weightKg: round(bw + 0.35 * rng.gaussian(), 1),
          neckCm: round(39 + 0.2 * rng.gaussian(), 1),
          waistCm: round(week < CUT_FROM_WEEK ? 92 + 0.3 * rng.gaussian() : 92 - 0.75 * (week - CUT_FROM_WEEK + 1) + 0.3 * rng.gaussian(), 1),
          hipCm: null,
        });
      }
    }

    DAY_OFFSETS.forEach((offset, dayIndex) => {
      const localDate = addDays(monday, offset);
      if (localDate > cfg.today || !cfg.includeSession(week, dayIndex)) return;
      const sessionBw = cfg.withBodyweight ? round(bw + 0.3 * rng.gaussian(), 1) : null;
      // mixed-units lifters enter some barbell sessions in pounds
      const unit: WeightUnit = cfg.mixedUnits && (week + dayIndex) % 2 === 1 ? "LB" : "KG";
      const t = (spec: Omit<TrainSpec, "week">) => train(rng, cfg, { ...spec, week }, deload, unit, sessionBw);
      const blocks: Block[] = [];

      const curlAtLoad = () => {
        const lb = week < 5 ? 70 : week < 11 ? 80 : 90;
        const n = curlSessionsAtLoad.get(lb) ?? 0;
        curlSessionsAtLoad.set(lb, n + 1);
        return legCurl(week, n, machines.legCurl, deload);
      };

      if (dayIndex === 0) {
        blocks.push(t({ key: "squat", nSets: 4, frac: 0.8, step: 2.5, rirs: [2, 2, 1, 1], warmups: true }));
        blocks.push(curlAtLoad());
      } else if (dayIndex === 1) {
        blocks.push(t({ key: "bench", nSets: 4, frac: 0.8, step: 2.5, rirs: [2, 2, 1, 1], warmups: true }));
        blocks.push(t({ key: "row", nSets: 4, frac: 0.7, step: 2.5, rirs: [2, 2, 1, 1] }));
        blocks.push(t({ key: "ohp", nSets: 4, frac: 0.7, step: 2.5, rirs: [2, 2, 1, 1] }));
        blocks.push(pullUps(rng, week, 3, deload));
        blocks.push(t({ key: "curl", nSets: 3, frac: 0.65, step: 2.5, rirs: [2, 1, 1] }));
      } else if (dayIndex === 2) {
        const machine = week < LEG_PRESS_GYM_B_FROM_WEEK ? machines.legPressA : machines.legPressB;
        blocks.push(t({ key: "legPress", machine, nSets: 4, frac: 0.75, step: 2.5, rirs: [2, 2, 1, 1] }));
        blocks.push(curlAtLoad());
      } else {
        blocks.push(pullUps(rng, week, 4, deload));
        blocks.push(t({ key: "bench", nSets: 3, frac: 0.78, step: 2.5, rirs: [2, 1, 1] }));
        blocks.push(t({ key: "inclineDb", nSets: 3, frac: 0.72, step: 2, rirs: [2, 1, 1] }));
        blocks.push(t({ key: "row", nSets: 3, frac: 0.7, step: 2.5, rirs: [2, 1, 1] }));
        blocks.push(t({ key: "curl", nSets: 3, frac: 0.65, step: 2.5, rirs: [2, 1, 1], drop: true }));
      }

      const workoutId = fixtureId(`${cfg.userKey}:w:${localDate}`);
      const start = zonedTimeToUtc(localDate, 18, 0, tz);
      let minute = 0;
      const exercises: FixtureWorkoutExercise[] = blocks.map((b, ei) => {
        const exerciseId = FIXTURE_EXERCISES[b.key].meta.id;
        const weId = fixtureId(`${cfg.userKey}:we:${localDate}:${ei}`);
        return {
          id: weId,
          exerciseId,
          machineProfileId: b.machine?.id ?? null,
          position: ei,
          sets: b.sets.map((s, si) => {
            minute += 3;
            return {
              id: fixtureId(`${cfg.userKey}:set:${localDate}:${ei}:${si}`),
              position: si,
              setType: s.setType,
              weightKg: s.weightKg,
              inputUnit: s.unit,
              reps: s.reps,
              rir: s.rir,
              completedAt: new Date(start.getTime() + minute * 60_000).toISOString(),
            };
          }),
        };
      });
      workouts.push({
        id: workoutId,
        title: `${DAY_LABELS[dayIndex]}${deload ? " (deload)" : ""}`,
        localDate,
        startedAt: start.toISOString(),
        endedAt: new Date(start.getTime() + (minute + 5) * 60_000).toISOString(),
        timezone: tz,
        bodyweightKg: sessionBw,
        isDeload: deload,
        exercises,
      });
    });
  }

  const machineList = Object.values(machines);
  const usedMachineIds = new Set(workouts.flatMap((w) => w.exercises.flatMap((e) => (e.machineProfileId ? [e.machineProfileId] : []))));
  const exerciseMetas = new Map(FIXTURE_EXERCISE_LIST.map((e) => [e.meta.id, e.meta]));
  const machineById = new Map(machineList.map((m) => [m.id, m]));

  const sets: SetFact[] = workouts.flatMap((w) =>
    w.exercises.flatMap((we) =>
      we.sets.map((s): SetFact => {
        const meta = exerciseMetas.get(we.exerciseId)!;
        const machine = we.machineProfileId ? machineById.get(we.machineProfileId) : undefined;
        const eff = effectiveLoadKg({ loadType: meta.loadType, weightKg: s.weightKg, isUnilateral: meta.isUnilateral, bodyweightKg: w.bodyweightKg, bodyweightFactor: meta.bodyweightFactor, baseLoadKg: machine?.baseLoadKg ?? null });
        const e1 = eff != null ? estimate1RM({ weightKg: eff, reps: s.reps, rir: s.rir })?.e1rmKg ?? null : null;
        return {
          id: s.id, workoutId: w.id, exerciseId: we.exerciseId, machineProfileId: we.machineProfileId,
          seriesKey: seriesKey(we.exerciseId, we.machineProfileId), localDate: w.localDate, completedAt: s.completedAt,
          setType: s.setType, weightKg: s.weightKg, effectiveLoadKg: eff, reps: s.reps, rir: s.rir, durationSec: null, distanceM: null,
          e1rmKg: e1, isDeload: w.isDeload, workoutBodyweightKg: w.bodyweightKg,
        };
      }),
    ),
  );
  const bodyFacts: BodyMetricFact[] = bodyMetrics.map((m) => ({
    localDate: m.localDate, weightKg: m.weightKg, bodyFatPct: null, bodyFatMethod: null, neckCm: m.neckCm, waistCm: m.waistCm,
    hipCm: m.hipCm, chestCm: null, armCm: null, thighCm: null, calfCm: null,
  }));

  const usedExercises = FIXTURE_EXERCISE_LIST.map((e) => e.meta).filter((m) => sets.some((s) => s.exerciseId === m.id));
  const usedMachines = machineList.filter((m) => usedMachineIds.has(m.id));
  const input: AnalyticsInput = { today: cfg.today, profile: cfg.profile, exercises: usedExercises, machineProfiles: usedMachines.map((m) => ({ id: m.id, name: m.name, gymName: m.gymName, brand: m.brand, exerciseId: m.exerciseId, labelUnit: m.labelUnit, pinStepKg: m.pinStepKg, baseLoadKg: m.baseLoadKg })), sets, bodyMetrics: bodyFacts };

  const deloadMonday = addDays(week0, 7 * DELOAD_WEEK_INDEX);
  const planted: PlantedSignals | null = cfg.planted
    ? {
        deload: { weekStart: deloadMonday, dates: workouts.filter((w) => w.isDeload).map((w) => w.localDate) },
        benchStall: { seriesKey: FIXTURE_EXERCISES.bench.meta.id, stalled: true, plateauFromWeek: BENCH_PLATEAU_FROM_WEEK },
        squatProgressing: { seriesKey: FIXTURE_EXERCISES.squat.meta.id, stalled: false },
        legPress: {
          gymA: { seriesKey: seriesKey(FIXTURE_EXERCISES.legPress.meta.id, machines.legPressA.id), machineProfileId: machines.legPressA.id },
          gymB: { seriesKey: seriesKey(FIXTURE_EXERCISES.legPress.meta.id, machines.legPressB.id), machineProfileId: machines.legPressB.id },
        },
        legCurl: { seriesKey: seriesKey(FIXTURE_EXERCISES.legCurl.meta.id, machines.legCurl.id), machineProfileId: machines.legCurl.id, labelUnit: "LB", pinStepKg: LEG_CURL_PIN_KG, progression: "add_reps" },
        weightedPullUps: { seriesKey: FIXTURE_EXERCISES.pullUp.meta.id },
        weightCut: { startDate: addDays(week0, 7 * CUT_FROM_WEEK), kgPerWeek: CUT_KG_PER_WEEK, tapeDates: bodyMetrics.filter((m) => m.waistCm != null).map((m) => m.localDate) },
      }
    : null;

  return {
    userKey: cfg.userKey, today: cfg.today, profile: cfg.profile, input, exercises: input.exercises,
    machineProfiles: usedMachines, workouts, bodyMetrics, planted,
  };
}

function profileFor(today: string, over: Partial<ProfileFact> = {}): ProfileFact {
  const birthDate = "1996-04-12";
  return {
    sex: "MALE", birthDate, ageYears: ageInYears(birthDate, today), heightCm: 180, experience: "INTERMEDIATE", goal: "HYPERTROPHY",
    e1rmFormula: "EPLEY", unitPreference: "KG", timezone: FIXTURE_TIMEZONE, ...over,
  };
}

function baseConfig(options: LifterOptions): Config {
  const today = options.today ?? FIXTURE_TODAY;
  return {
    userKey: options.userKey ?? "demo",
    seed: options.seed ?? 20260101,
    today,
    weeks: options.weeks ?? FIXTURE_WEEKS,
    profile: profileFor(today),
    includeSession: () => true,
    withBodyweight: true,
    mixedUnits: false,
    strengthDrop: options.strengthDropDuringCut ?? false,
    planted: true,
  };
}

/** The full 16-week intermediate lifter with rows for seeding the database (workouts, machine profiles, body metrics). */
export function generateLifterRows(options: LifterOptions = {}): FixtureHistory {
  return buildHistory(baseConfig(options));
}

/** The 16-week intermediate lifter as analytics input (see the header for the planted signals). */
export function generateLifterHistory(options: LifterOptions = {}): AnalyticsInput {
  return generateLifterRows(options).input;
}

/** Edge-case users: brand new, one session, a long layoff, kg/lb mixed entry, no bodyweight, PREFER_NOT_TO_SAY. */
export function generateEdgeCaseUser(kind: EdgeCaseKind, options: LifterOptions = {}): FixtureHistory {
  const cfg = baseConfig({ userKey: `edge-${kind}`, ...options });
  cfg.planted = false;
  const last = cfg.weeks - 1;
  switch (kind) {
    case "brand-new":
      cfg.includeSession = () => false;
      cfg.withBodyweight = false;
      cfg.profile = { ...profileFor(cfg.today), sex: null, birthDate: null, ageYears: null, heightCm: null, experience: null, goal: null };
      break;
    case "one-session":
      cfg.includeSession = (w, d) => w === last && d === 1;
      cfg.withBodyweight = false;
      break;
    case "layoff":
      // 6 weeks of training, an 8-week layoff, then 2 weeks back
      cfg.includeSession = (w) => w <= 5 || w >= last - 1;
      break;
    case "mixed-units":
      cfg.mixedUnits = true;
      cfg.profile = profileFor(cfg.today, { unitPreference: "LB" });
      break;
    case "no-bodyweight":
      cfg.withBodyweight = false;
      break;
    case "prefer-not-to-say":
      cfg.profile = profileFor(cfg.today, { sex: "PREFER_NOT_TO_SAY" satisfies Sex });
      break;
  }
  return buildHistory(cfg);
}
