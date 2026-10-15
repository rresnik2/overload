// Pure shaping for the progress pages (no Prisma, no server-only): the loaders in ./progress.ts feed it fact rows, the unit
// tests feed it D's fixtures, and the chart components import the types. Output is plain JSON (kg and ISO dates, no Decimal).
import type {
  ExerciseMeta,
  ForecastInsufficientReason,
  MachineProfileMeta,
  MuscleVolume,
  ProfileFact,
  SessionPoint,
  SetFact,
} from "@/contracts/analytics";
import type { Modality, StandardLift } from "@/contracts/enums";
import { addDays, diffDays, isoWeekStart, type LocalDate } from "@/lib/dates";
import { sessionBestE1rm } from "@/lib/analytics/series";
import { forecastE1rm } from "@/lib/analytics/forecast";
import { weeklyMuscleVolume } from "@/lib/analytics/volume";
import { dots } from "@/lib/analytics/scores";
import { strengthPercentile } from "@/lib/analytics/standards";
import { round } from "@/lib/units";

export const HISTORY_WEEKS = 52;
export const HEATMAP_WEEKS = 16;

// ───────────────────────────── types (consumed by components) ─────────────────────────────

export interface SeriesRef {
  /** `exerciseId` or `exerciseId:machineProfileId`. */
  seriesKey: string;
  exerciseId: string;
  machineProfileId: string | null;
  /** "Default" for the series without a machine profile, else "<machine> · <gym>". */
  label: string;
  modality: Modality;
  sessions: number;
  lastLocalDate: LocalDate;
}

export interface E1rmPoint {
  localDate: LocalDate;
  e1rmKg: number;
  isDeload: boolean;
  /** A new best e1RM (strictly above every earlier session of this series). The first session is not a record. */
  isPr: boolean;
}

export interface TopSetPoint {
  localDate: LocalDate;
  /** Effective load (kg) of the heaviest working set of the session. */
  weightKg: number;
  reps: number;
}

export interface VolumePoint {
  localDate: LocalDate;
  /** Sum of effective load x reps over the session's working sets (kg). */
  volumeKg: number;
  sets: number;
}

export interface ForecastBandPoint {
  localDate: LocalDate;
  p50: number;
  low50: number;
  high50: number;
  low80: number;
  high80: number;
}

export type ForecastView =
  | { status: "ok"; points: ForecastBandPoint[]; usedSessions: number; excluded: { deload: number; outliers: number; beforeLayoff: number } }
  | { status: "insufficient"; reason: ForecastInsufficientReason; haveSessions: number; haveWeeks: number; needSessions: number; needWeeks: number };

export interface StrengthView {
  /** Only barbell squat / bench / deadlift and only when norms are embedded: null otherwise (machines never). */
  percentile: { percentile: number; population: string; source: string } | null;
}

export interface SeriesProgress {
  ref: SeriesRef;
  e1rm: E1rmPoint[];
  topSets: TopSetPoint[];
  volume: VolumePoint[];
  forecast: ForecastView;
  latestE1rmKg: number | null;
  bestE1rmKg: number | null;
  /** Date of the best e1RM. */
  bestLocalDate: LocalDate | null;
  strength: StrengthView;
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  modality: Modality;
  standardLift: StandardLift | null;
  /** Every series the user has logged for this exercise (default + one per machine profile). */
  series: SeriesRef[];
  selected: SeriesProgress | null;
}

export interface SeriesCard {
  ref: SeriesRef;
  exerciseName: string;
  latestE1rmKg: number | null;
  /** latest e1RM minus the session ~4 weeks earlier (kg); null without an earlier session. */
  deltaKg: number | null;
  setCount: number;
}

export interface WeekVolume {
  weekStart: LocalDate;
  muscles: MuscleVolume[];
}

export interface HeatmapCell {
  localDate: LocalDate;
  /** Completed working sets that day. */
  sets: number;
  /** 0 = rest, 1-4 = quartile of the busy days. */
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export interface Heatmap {
  /** Monday-first columns of 7 days, oldest week first. */
  weeks: { weekStart: LocalDate; cells: HeatmapCell[] }[];
  totalSets: number;
  trainingDays: number;
}

export interface BigThree {
  /** One entry per lift: the best free-weight barbell e1RM in the window, or null when not logged. */
  lifts: { standardLift: "SQUAT" | "BENCH_PRESS" | "DEADLIFT"; e1rmKg: number | null }[];
  totalKg: number | null;
  bodyweightKg: number | null;
  dots: number | null;
}

export interface ProgressOverview {
  today: LocalDate;
  cards: SeriesCard[];
  weeks: WeekVolume[];
  heatmap: Heatmap;
  bigThree: BigThree;
}

// ───────────────────────────── helpers ─────────────────────────────

const WORKING = (s: SetFact) => s.setType !== "WARMUP";

export function seriesLabel(machine: MachineProfileMeta | null | undefined): string {
  if (!machine) return "Default";
  return machine.gymName ? `${machine.name} · ${machine.gymName}` : machine.name;
}

/** Series of one exercise present in `sets`, newest first (default series wins a tie so it is listed before machines). */
export function buildSeriesRefs(exercise: ExerciseMeta, machineProfiles: MachineProfileMeta[], sets: SetFact[]): SeriesRef[] {
  const groups = new Map<string, { sets: SetFact[]; machineProfileId: string | null }>();
  for (const s of sets) {
    if (s.exerciseId !== exercise.id) continue;
    const g = groups.get(s.seriesKey) ?? { sets: [], machineProfileId: s.machineProfileId };
    g.sets.push(s);
    groups.set(s.seriesKey, g);
  }
  const machineById = new Map(machineProfiles.map((m) => [m.id, m]));
  const refs: SeriesRef[] = [];
  for (const [seriesKey, g] of groups) {
    refs.push({
      seriesKey,
      exerciseId: exercise.id,
      machineProfileId: g.machineProfileId,
      label: seriesLabel(g.machineProfileId ? machineById.get(g.machineProfileId) : null),
      modality: exercise.modality,
      sessions: new Set(g.sets.map((s) => s.localDate)).size,
      lastLocalDate: g.sets.reduce((max, s) => (s.localDate > max ? s.localDate : max), ""),
    });
  }
  return refs.sort(
    (a, b) =>
      b.lastLocalDate.localeCompare(a.lastLocalDate) ||
      Number(a.machineProfileId !== null) - Number(b.machineProfileId !== null) ||
      a.seriesKey.localeCompare(b.seriesKey),
  );
}

/** Sessions where the e1RM beat every earlier session (running maximum). */
export function markPrs(points: SessionPoint[]): E1rmPoint[] {
  let best = -Infinity;
  return points.map((p, i) => {
    const isPr = i > 0 && p.e1rmKg > best;
    best = Math.max(best, p.e1rmKg);
    return { localDate: p.localDate, e1rmKg: p.e1rmKg, isDeload: p.isDeload, isPr };
  });
}

export function topSetPoints(sets: SetFact[]): TopSetPoint[] {
  const byDate = new Map<string, TopSetPoint>();
  for (const s of sets) {
    if (!WORKING(s) || s.setType === "DROP" || s.effectiveLoadKg == null || s.effectiveLoadKg <= 0 || s.reps == null || s.reps < 1) continue;
    const cur = byDate.get(s.localDate);
    if (!cur || s.effectiveLoadKg > cur.weightKg || (s.effectiveLoadKg === cur.weightKg && s.reps > cur.reps)) {
      byDate.set(s.localDate, { localDate: s.localDate, weightKg: s.effectiveLoadKg, reps: s.reps });
    }
  }
  return [...byDate.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export function volumePoints(sets: SetFact[]): VolumePoint[] {
  const byDate = new Map<string, VolumePoint>();
  for (const s of sets) {
    if (!WORKING(s) || s.effectiveLoadKg == null || s.reps == null || s.reps < 1) continue;
    const cur = byDate.get(s.localDate) ?? { localDate: s.localDate, volumeKg: 0, sets: 0 };
    cur.volumeKg += s.effectiveLoadKg * s.reps;
    cur.sets += 1;
    byDate.set(s.localDate, cur);
  }
  return [...byDate.values()]
    .map((v) => ({ ...v, volumeKg: round(v.volumeKg, 1) }))
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

function e1rmOpts(profile: Pick<ProfileFact, "e1rmFormula">) {
  return profile.e1rmFormula === "EPLEY" ? undefined : { formula: profile.e1rmFormula };
}

// ───────────────────────────── one series ─────────────────────────────

export interface SeriesInput {
  exercise: ExerciseMeta;
  ref: SeriesRef;
  /** Completed sets of THIS series only. */
  sets: SetFact[];
  profile: ProfileFact;
  today: LocalDate;
  /** Date of the user's first logged workout (anchors t0 when the experience level is unknown). */
  firstWorkoutDate: LocalDate | null;
  /** Latest bodyweight (kg) for the percentile lookup. */
  bodyweightKg: number | null;
}

export function buildSeriesProgress(input: SeriesInput): SeriesProgress {
  const { exercise, ref, profile, today } = input;
  // A series never mixes: whatever the caller passed, only this seriesKey is used.
  const sets = input.sets.filter((s) => s.seriesKey === ref.seriesKey);
  const points = sessionBestE1rm(sets, e1rmOpts(profile));
  const forecast = forecastE1rm({
    points,
    sex: profile.sex,
    experience: profile.experience,
    standardLift: exercise.standardLift,
    firstWorkoutDate: input.firstWorkoutDate,
    today,
    horizonWeeks: 12,
  });
  const e1rm = markPrs(points);
  const best = e1rm.reduce<E1rmPoint | null>((b, p) => (!b || p.e1rmKg > b.e1rmKg ? p : b), null);
  return {
    ref,
    e1rm,
    topSets: topSetPoints(sets),
    volume: volumePoints(sets),
    forecast:
      forecast.status === "ok"
        ? { status: "ok", points: forecast.points, usedSessions: forecast.model.usedSessions, excluded: forecast.model.excluded }
        : {
            status: "insufficient",
            reason: forecast.reason,
            haveSessions: forecast.haveSessions,
            haveWeeks: forecast.haveWeeks,
            needSessions: forecast.needSessions,
            needWeeks: forecast.needWeeks,
          },
    latestE1rmKg: e1rm.at(-1)?.e1rmKg ?? null,
    bestE1rmKg: best?.e1rmKg ?? null,
    bestLocalDate: best?.localDate ?? null,
    strength: { percentile: percentileFor(exercise, ref, best?.e1rmKg ?? null, profile, input.bodyweightKg) },
  };
}

/** Percentile only for a barbell standard lift on the default (non-machine) series; `strengthPercentile` is null without norms. */
function percentileFor(
  exercise: ExerciseMeta,
  ref: SeriesRef,
  e1rmKg: number | null,
  profile: ProfileFact,
  bodyweightKg: number | null,
): StrengthView["percentile"] {
  if (ref.machineProfileId || exercise.modality !== "FREE_WEIGHT" || !exercise.standardLift) return null;
  if (e1rmKg == null || bodyweightKg == null || !profile.sex) return null;
  return strengthPercentile({ standardLift: exercise.standardLift, e1rmKg, bodyweightKg, sex: profile.sex, ageYears: profile.ageYears });
}

export interface ExerciseProgressInput {
  exercise: ExerciseMeta;
  machineProfiles: MachineProfileMeta[];
  /** All completed sets of this exercise (every series). */
  sets: SetFact[];
  /** `seriesKey` from the URL; falls back to the most recently trained series. */
  selectedKey?: string | null;
  profile: ProfileFact;
  today: LocalDate;
  firstWorkoutDate: LocalDate | null;
  bodyweightKg: number | null;
}

export function buildExerciseProgress(input: ExerciseProgressInput): ExerciseProgress {
  const series = buildSeriesRefs(input.exercise, input.machineProfiles, input.sets);
  const chosen = series.find((s) => s.seriesKey === input.selectedKey) ?? series[0] ?? null;
  return {
    exerciseId: input.exercise.id,
    name: input.exercise.name,
    modality: input.exercise.modality,
    standardLift: input.exercise.standardLift,
    series,
    selected: chosen
      ? buildSeriesProgress({
          exercise: input.exercise,
          ref: chosen,
          sets: input.sets.filter((s) => s.seriesKey === chosen.seriesKey),
          profile: input.profile,
          today: input.today,
          firstWorkoutDate: input.firstWorkoutDate,
          bodyweightKg: input.bodyweightKg,
        })
      : null,
  };
}

// ───────────────────────────── overview ─────────────────────────────

export function buildSeriesCards(exercises: ExerciseMeta[], machineProfiles: MachineProfileMeta[], sets: SetFact[], profile: ProfileFact): SeriesCard[] {
  const cards: SeriesCard[] = [];
  for (const exercise of exercises) {
    const exerciseSets = sets.filter((s) => s.exerciseId === exercise.id);
    for (const ref of buildSeriesRefs(exercise, machineProfiles, exerciseSets)) {
      const seriesSets = exerciseSets.filter((s) => s.seriesKey === ref.seriesKey);
      const points = sessionBestE1rm(seriesSets, e1rmOpts(profile));
      const last = points.at(-1) ?? null;
      const earlier = last ? points.filter((p) => diffDays(p.localDate, last.localDate) >= 28).at(-1) : undefined;
      cards.push({
        ref,
        exerciseName: exercise.name,
        latestE1rmKg: last?.e1rmKg ?? null,
        deltaKg: last && earlier ? round(last.e1rmKg - earlier.e1rmKg, 1) : null,
        setCount: seriesSets.length,
      });
    }
  }
  return cards.sort((a, b) => b.ref.lastLocalDate.localeCompare(a.ref.lastLocalDate) || a.ref.seriesKey.localeCompare(b.ref.seriesKey));
}

export function buildHeatmap(sets: SetFact[], today: LocalDate, weeks = HEATMAP_WEEKS): Heatmap {
  const perDay = new Map<string, number>();
  for (const s of sets) if (WORKING(s)) perDay.set(s.localDate, (perDay.get(s.localDate) ?? 0) + 1);
  const firstWeek = addDays(isoWeekStart(today), -7 * (weeks - 1));
  const busy = [...perDay.entries()].filter(([d]) => d >= firstWeek && d <= today).map(([, n]) => n).sort((a, b) => a - b);
  const quartile = (q: number) => busy[Math.min(busy.length - 1, Math.floor(q * busy.length))] ?? 0;
  const cuts = [quartile(0.25), quartile(0.5), quartile(0.75)];
  const level = (n: number): HeatmapCell["level"] => (n <= 0 ? 0 : n <= cuts[0]! ? 1 : n <= cuts[1]! ? 2 : n <= cuts[2]! ? 3 : 4);

  let totalSets = 0;
  let trainingDays = 0;
  const out: Heatmap["weeks"] = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(firstWeek, 7 * w);
    const cells: HeatmapCell[] = [];
    for (let d = 0; d < 7; d++) {
      const localDate = addDays(weekStart, d);
      const future = localDate > today;
      const n = future ? 0 : (perDay.get(localDate) ?? 0);
      if (n > 0) {
        totalSets += n;
        trainingDays += 1;
      }
      cells.push({ localDate, sets: n, level: level(n), future });
    }
    out.push({ weekStart, cells });
  }
  return { weeks: out, totalSets, trainingDays };
}

const BIG_THREE = ["SQUAT", "BENCH_PRESS", "DEADLIFT"] as const;

/** DOTS needs a squat + bench + deadlift total: barbell free-weight series only, never machines. */
export function buildBigThree(
  exercises: ExerciseMeta[],
  sets: SetFact[],
  profile: ProfileFact,
  bodyweightKg: number | null,
  formula = e1rmOpts(profile),
): BigThree {
  const lifts = BIG_THREE.map((standardLift) => {
    const ids = new Set(exercises.filter((e) => e.standardLift === standardLift && e.modality === "FREE_WEIGHT").map((e) => e.id));
    const seriesSets = sets.filter((s) => ids.has(s.exerciseId) && s.machineProfileId === null);
    const best = Math.max(0, ...sessionBestE1rm(seriesSets, formula).map((p) => p.e1rmKg));
    return { standardLift, e1rmKg: best > 0 ? best : null };
  });
  const complete = lifts.every((l) => l.e1rmKg != null);
  const totalKg = complete ? round(lifts.reduce((sum, l) => sum + (l.e1rmKg ?? 0), 0), 1) : null;
  const score = totalKg != null && bodyweightKg != null && profile.sex ? dots({ totalKg, bodyweightKg, sex: profile.sex }) : null;
  return { lifts, totalKg, bodyweightKg, dots: score };
}

export function buildWeeklyVolumes(
  exercises: ExerciseMeta[],
  sets: SetFact[],
  profile: ProfileFact,
  today: LocalDate,
  weeks = 2,
): WeekVolume[] {
  const thisWeek = isoWeekStart(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * i);
    return { weekStart, muscles: weeklyMuscleVolume({ sets, exercises, weekStart, goal: profile.goal }) };
  });
}

export function buildOverview(input: {
  today: LocalDate;
  profile: ProfileFact;
  exercises: ExerciseMeta[];
  machineProfiles: MachineProfileMeta[];
  sets: SetFact[];
  bodyweightKg: number | null;
}): ProgressOverview {
  return {
    today: input.today,
    cards: buildSeriesCards(input.exercises, input.machineProfiles, input.sets, input.profile),
    weeks: buildWeeklyVolumes(input.exercises, input.sets, input.profile, input.today),
    heatmap: buildHeatmap(input.sets, input.today),
    bigThree: buildBigThree(input.exercises, input.sets, input.profile, input.bodyweightKg),
  };
}
