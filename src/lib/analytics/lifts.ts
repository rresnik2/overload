// The four main lifts on /today: current estimated 1RM, the change over 4 weeks, and the lift the chart should show.
// PURE: no Prisma, no React. The loader in src/server/queries/today.ts feeds it facts; unit tests feed it fixtures.
import type { AnalyticsInput, SessionPoint } from "@/contracts/analytics";
import { addDays, diffDays, type LocalDate } from "@/lib/dates";
import { round } from "@/lib/units";
import { STALL_WINDOW_WEEKS } from "./constants";
import { buildSeries } from "./insights/context";
import { detectStall } from "./progression";

export const TILE_LIFTS = ["SQUAT", "BENCH_PRESS", "DEADLIFT", "OVERHEAD_PRESS"] as const;
export type TileLift = (typeof TILE_LIFTS)[number];

export const TILE_LIFT_LABEL: Record<TileLift, string> = {
  SQUAT: "Back squat",
  BENCH_PRESS: "Bench press",
  DEADLIFT: "Deadlift",
  OVERHEAD_PRESS: "Overhead press",
};

/** Plate colour token of each lift (squat red, bench blue, deadlift yellow, overhead press green). */
export const TILE_LIFT_PLATE: Record<TileLift, "red" | "blue" | "yellow" | "green"> = {
  SQUAT: "red",
  BENCH_PRESS: "blue",
  DEADLIFT: "yellow",
  OVERHEAD_PRESS: "green",
};

/** The look-back for "change": the latest session against the last session at least this many days earlier. */
export const CHANGE_DAYS = 28;
export const CHART_WEEKS = 12;
/** The history the loader reads: enough that a lift trained a few months ago still shows its last estimate. */
export const TODAY_HISTORY_WEEKS = 52;

export interface E1rmChange {
  e1rmKg: number;
  localDate: LocalDate;
  /** Latest minus the last session at least 28 days before it (kg, 1 dp). null without such a session. */
  changeKg: number | null;
}

/**
 * The current estimate (the latest session's best e1RM) and its 4-week change. Deload sessions are skipped (a lighter week is not
 * a loss of strength) unless every session is a deload. Points must be oldest first.
 */
export function fourWeekChange(points: SessionPoint[]): E1rmChange | null {
  const live = points.filter((p) => !p.isDeload);
  const use = live.length > 0 ? live : points;
  const last = use.at(-1);
  if (!last) return null;
  const earlier = use.filter((p) => diffDays(p.localDate, last.localDate) >= CHANGE_DAYS).at(-1);
  return { e1rmKg: last.e1rmKg, localDate: last.localDate, changeKg: earlier ? round(last.e1rmKg - earlier.e1rmKg, 1) : null };
}

export interface LiftTile {
  lift: TileLift;
  name: string;
  /** null = no history for this lift (the empty state). */
  seriesKey: string | null;
  e1rmKg: number | null;
  changeKg: number | null;
  lastLocalDate: LocalDate | null;
}

export interface ChartPoint {
  localDate: LocalDate;
  e1rmKg: number;
  isDeload: boolean;
}

export interface StallBand {
  from: LocalDate;
  to: LocalDate;
  /** Whole weeks the band covers, for its label ("Flat 6 wk"). */
  weeks: number;
}

export interface LiftChartData {
  lift: TileLift;
  name: string;
  seriesKey: string;
  from: LocalDate;
  to: LocalDate;
  points: ChartPoint[];
  /** Shaded when the insight rules call the lift stalled, or the 4-week change is exactly 0. */
  band: StallBand | null;
  stalled: boolean;
}

export interface TodayLifts {
  today: LocalDate;
  tiles: LiftTile[];
  /** null when none of the four lifts has any history. */
  chart: LiftChartData | null;
}

interface Candidate {
  lift: TileLift;
  seriesKey: string;
  points: SessionPoint[];
  stalled: boolean;
  stallChangePct: number | null;
}

/** The lift the chart is for: a stalled lift (the lowest change wins), else bench, else whichever lift was trained last. */
export function pickFocusLift(candidates: Pick<Candidate, "lift" | "stalled" | "stallChangePct" | "points">[]): TileLift | null {
  if (candidates.length === 0) return null;
  const stalled = candidates.filter((c) => c.stalled).sort((a, b) => (a.stallChangePct ?? 0) - (b.stallChangePct ?? 0));
  if (stalled[0]) return stalled[0].lift;
  const bench = candidates.find((c) => c.lift === "BENCH_PRESS");
  if (bench) return bench.lift;
  const lastDate = (c: Candidate["points"]) => c.at(-1)?.localDate ?? "";
  return [...candidates].sort((a, b) => lastDate(b.points).localeCompare(lastDate(a.points)))[0]!.lift;
}

/** The part of a series inside the chart window, oldest first. Deload sessions are left out: a light week is not an estimate. */
export function chartWindow(points: SessionPoint[], today: LocalDate, weeks = CHART_WEEKS): { from: LocalDate; points: ChartPoint[] } {
  const from = addDays(today, -7 * weeks);
  return {
    from,
    points: points.filter((p) => !p.isDeload && p.localDate >= from && p.localDate <= today).map((p) => ({ localDate: p.localDate, e1rmKg: p.e1rmKg, isDeload: p.isDeload })),
  };
}

/** y-axis ticks: up to `count` round values spanning [min, max] (kg), at a 1, 2, 2.5, 5 or 10 times a power of ten. */
export function axisTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [Math.round(min)];
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag);
  const first = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = first; v < max + step; v += step) ticks.push(round(v, 4));
  return ticks;
}

export function buildTodayLifts(input: AnalyticsInput): TodayLifts {
  const series = buildSeries(input);
  const tiles: LiftTile[] = [];
  const candidates: Candidate[] = [];

  for (const lift of TILE_LIFTS) {
    // Free-weight work only (a Smith machine or a leg press never stands in for a barbell lift); when a lift has several series
    // (e.g. two bar profiles) the one trained most recently speaks for it.
    const best = series
      .filter((s) => s.exercise?.standardLift === lift && s.exercise.modality === "FREE_WEIGHT" && s.points.length > 0)
      .sort((a, b) => (b.points.at(-1)?.localDate ?? "").localeCompare(a.points.at(-1)?.localDate ?? ""))[0];
    const change = best ? fourWeekChange(best.points) : null;
    if (!best || !change) {
      tiles.push({ lift, name: TILE_LIFT_LABEL[lift], seriesKey: null, e1rmKg: null, changeKg: null, lastLocalDate: null });
      continue;
    }
    tiles.push({ lift, name: TILE_LIFT_LABEL[lift], seriesKey: best.seriesKey, e1rmKg: change.e1rmKg, changeKg: change.changeKg, lastLocalDate: change.localDate });
    const stall = detectStall(best.points, input.today);
    candidates.push({ lift, seriesKey: best.seriesKey, points: best.points, stalled: stall.stalled, stallChangePct: stall.changePct });
  }

  const focus = pickFocusLift(candidates);
  const picked = candidates.find((c) => c.lift === focus);
  if (!picked) return { today: input.today, tiles, chart: null };

  const { from, points } = chartWindow(picked.points, input.today);
  const tile = tiles.find((t) => t.lift === picked.lift)!;
  let band: StallBand | null = null;
  if (picked.stalled) {
    band = { from: addDays(input.today, -7 * STALL_WINDOW_WEEKS), to: input.today, weeks: STALL_WINDOW_WEEKS };
  } else if (tile.changeKg === 0) {
    band = { from: addDays(input.today, -CHANGE_DAYS), to: input.today, weeks: CHANGE_DAYS / 7 };
  }
  return {
    today: input.today,
    tiles,
    chart: { lift: picked.lift, name: TILE_LIFT_LABEL[picked.lift], seriesKey: picked.seriesKey, from, to: input.today, points, band, stalled: picked.stalled },
  };
}
