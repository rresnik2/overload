// e1RM forecast: Bayesian linear regression on ln(t + t0) in closed form (steele2022, latella2020, swinton2021).
//
// Work in relative units z = e1RM / median(e1RM) so the prior is a PERCENT curve shared by everyone (sex and lift do
// not change its shape: docs/research.md "Sex, age and body composition"). With x = ln(t + t0) - ln(t0):
//   z = a + b x + noise,  noise ~ N(0, 0.05^2),  a ~ N(1, 1^2),  b ~ N(0.16, 0.08^2)
// The 2x2 normal-inverse algebra below is the whole model. y = intercept + slope * ln(t + t0) in kg is recovered from it.
import type { ForecastE1rm, ForecastInput, ForecastInsufficientReason, ForecastModel, ForecastPoint, SessionPoint } from "@/contracts/analytics";
import { addDays, diffDays } from "@/lib/dates";
import { round } from "@/lib/units";
import {
  FORECAST_MAX_HORIZON_WEEKS,
  FORECAST_MIN_SESSIONS,
  FORECAST_MIN_WEEKS,
  FORECAST_NOISE_FRACTION,
  FORECAST_PRIOR_LEVEL_SD,
  FORECAST_PRIOR_SLOPE,
  FORECAST_PRIOR_SLOPE_SD,
  LAYOFF_DAYS,
  MAD_FLOOR_FRACTION,
  MAD_SCALE,
  OUTLIER_MAD_MULTIPLIER,
  T0_WEEKS_BY_EXPERIENCE,
  T0_WEEKS_MIN,
  T0_WEEKS_UNKNOWN,
  Z_50,
  Z_80,
} from "./constants";

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface PreparedSeries {
  /** Points the fit uses: after the last layoff, without deloads and outliers. Oldest first. */
  used: SessionPoint[];
  excluded: ForecastModel["excluded"];
  /** true when the last session is >= 4 weeks before today (an ongoing layoff). */
  ongoingLayoff: boolean;
}

/** Layoff reset -> drop deload sessions -> drop outliers (> 3 scaled MAD from the median). */
export function prepareSeries(points: SessionPoint[], today: string): PreparedSeries {
  const sorted = [...points].sort((a, b) => a.localDate.localeCompare(b.localDate));
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i - 1]!.localDate, sorted[i]!.localDate) >= LAYOFF_DAYS) start = i;
  }
  const segment = sorted.slice(start);
  const nonDeload = segment.filter((p) => !p.isDeload);

  let used = nonDeload;
  if (nonDeload.length >= 3) {
    const med = median(nonDeload.map((p) => p.e1rmKg));
    const mad = Math.max(median(nonDeload.map((p) => Math.abs(p.e1rmKg - med))) * MAD_SCALE, med * MAD_FLOOR_FRACTION);
    used = nonDeload.filter((p) => Math.abs(p.e1rmKg - med) <= OUTLIER_MAD_MULTIPLIER * mad);
  }

  const last = sorted[sorted.length - 1];
  return {
    used,
    excluded: { deload: segment.length - nonDeload.length, outliers: nonDeload.length - used.length, beforeLayoff: start },
    ongoingLayoff: last ? diffDays(last.localDate, today) >= LAYOFF_DAYS : false,
  };
}

/** Training age in weeks at the first fitted session: experience (or an unknown default) plus the time logged so far. */
export function t0Weeks(input: Pick<ForecastInput, "experience" | "firstWorkoutDate">, firstUsedDate: string): number {
  const base = input.experience ? T0_WEEKS_BY_EXPERIENCE[input.experience] : T0_WEEKS_UNKNOWN;
  const logged = input.firstWorkoutDate ? Math.max(0, diffDays(input.firstWorkoutDate, firstUsedDate) / 7) : 0;
  return Math.max(T0_WEEKS_MIN, base + logged);
}

interface Posterior {
  mean: [number, number];
  /** Posterior covariance [[caa, cab], [cab, cbb]]. */
  cov: [number, number, number];
}

interface Design {
  x: number[];
  z: number[];
  ref: number;
  t0: number;
  firstDate: string;
}

function design(used: SessionPoint[], t0: number): Design {
  const firstDate = used[0]!.localDate;
  const ref = median(used.map((p) => p.e1rmKg));
  return {
    x: used.map((p) => Math.log(diffDays(firstDate, p.localDate) / 7 + t0) - Math.log(t0)),
    z: used.map((p) => p.e1rmKg / ref),
    ref,
    t0,
    firstDate,
  };
}

function posterior(d: Design, prior: { levelSd: number; slope: number; slopeSd: number }): Posterior {
  const s2 = FORECAST_NOISE_FRACTION ** 2;
  const n = d.x.length;
  let sx = 0;
  let sxx = 0;
  let sz = 0;
  let sxz = 0;
  for (let i = 0; i < n; i++) {
    sx += d.x[i]!;
    sxx += d.x[i]! ** 2;
    sz += d.z[i]!;
    sxz += d.x[i]! * d.z[i]!;
  }
  const laa = 1 / prior.levelSd ** 2 + n / s2;
  const lab = sx / s2;
  const lbb = 1 / prior.slopeSd ** 2 + sxx / s2;
  const ra = 1 / prior.levelSd ** 2 + sz / s2; // prior level mean is 1
  const rb = prior.slope / prior.slopeSd ** 2 + sxz / s2;
  const det = laa * lbb - lab * lab;
  const caa = lbb / det;
  const cab = -lab / det;
  const cbb = laa / det;
  return { mean: [caa * ra + cab * rb, cab * ra + cbb * rb], cov: [caa, cab, cbb] };
}

const POPULATION_PRIOR = { levelSd: FORECAST_PRIOR_LEVEL_SD, slope: FORECAST_PRIOR_SLOPE, slopeSd: FORECAST_PRIOR_SLOPE_SD };

function insufficient(
  reason: ForecastInsufficientReason,
  prepared: PreparedSeries,
): Extract<ReturnType<ForecastE1rm>, { status: "insufficient" }> {
  const { used } = prepared;
  const spanWeeks = used.length ? diffDays(used[0]!.localDate, used[used.length - 1]!.localDate) / 7 : 0;
  return {
    status: "insufficient",
    reason,
    haveSessions: used.length,
    haveWeeks: round(spanWeeks, 1),
    needSessions: FORECAST_MIN_SESSIONS,
    needWeeks: FORECAST_MIN_WEEKS,
  };
}

/** Why the series cannot be fitted, or null when it can (>= 6 sessions over >= 3 weeks, no ongoing layoff). */
function insufficiency(prepared: PreparedSeries): ForecastInsufficientReason | null {
  const { used, excluded, ongoingLayoff } = prepared;
  if (ongoingLayoff) return "layoff";
  const span = used.length ? diffDays(used[0]!.localDate, used[used.length - 1]!.localDate) / 7 : 0;
  if (used.length < FORECAST_MIN_SESSIONS) return excluded.beforeLayoff > 0 ? "layoff" : "sessions";
  if (span < FORECAST_MIN_WEEKS) return excluded.beforeLayoff > 0 ? "layoff" : "span";
  return null;
}

/** Bayesian linear regression on ln(t + t0); needs >= 6 sessions over >= 3 weeks; <= 12-week horizon; 50%/80% bands. */
export const forecastE1rm: ForecastE1rm = (input) => {
  const prepared = prepareSeries(input.points, input.today);
  const reason = insufficiency(prepared);
  if (reason) return insufficient(reason, prepared);

  const { used, excluded } = prepared;
  const d = design(used, t0Weeks(input, used[0]!.localDate));
  const post = posterior(d, POPULATION_PRIOR);
  const [ma, mb] = post.mean;
  const [caa, cab, cbb] = post.cov;
  const sigmaZ = FORECAST_NOISE_FRACTION;
  const xLast = d.x[d.x.length - 1]!;

  const horizon = Math.min(FORECAST_MAX_HORIZON_WEEKS, Math.max(1, Math.floor(input.horizonWeeks ?? FORECAST_MAX_HORIZON_WEEKS)));
  const points: ForecastPoint[] = [];
  for (let k = 1; k <= horizon; k++) {
    const localDate = addDays(input.today, 7 * k);
    const tWeeks = diffDays(d.firstDate, localDate) / 7;
    // Never extrapolate backwards past the last observed point (a stale `today` before the data still yields a sane curve).
    const x = Math.max(xLast, Math.log(tWeeks + d.t0) - Math.log(d.t0));
    const mean = ma + mb * x;
    const sd = Math.sqrt(sigmaZ ** 2 + caa + 2 * cab * x + cbb * x * x);
    const at = (zScore: number) => Math.max(0, round((mean + zScore * sd) * d.ref, 2));
    points.push({
      localDate,
      p50: at(0),
      low50: at(-Z_50),
      high50: at(Z_50),
      low80: at(-Z_80),
      high80: at(Z_80),
    });
  }

  const model: ForecastModel = {
    intercept: round((ma - mb * Math.log(d.t0)) * d.ref, 4),
    slope: round(mb * d.ref, 4),
    t0Weeks: round(d.t0, 2),
    sigmaKg: round(sigmaZ * d.ref, 3),
    usedSessions: used.length,
    excluded,
  };
  return { status: "ok", points, model };
};

export interface PopulationComparison {
  spanWeeks: number;
  /** Observed change in e1RM over the fitted span (percent) with its 80% band (data only, flat prior). */
  observed: { pct: number; low80: number; high80: number };
  /** What the population curve predicts over the same span (percent) with its 80% band. */
  expected: { pct: number; low80: number; high80: number };
  /** "ahead"/"behind" only when the two 80% bands do not overlap. */
  verdict: "ahead" | "behind" | "on-track";
}

/** Observed progress vs the population (Steele) curve over the same span. null when the series cannot be fitted. */
export function compareToPopulation(input: ForecastInput): PopulationComparison | null {
  const prepared = prepareSeries(input.points, input.today);
  if (insufficiency(prepared)) return null;
  const { used } = prepared;
  const d = design(used, t0Weeks(input, used[0]!.localDate));
  const data = posterior(d, { levelSd: FORECAST_PRIOR_LEVEL_SD, slope: 0, slopeSd: 1000 });
  const xLast = d.x[d.x.length - 1]!;
  const level = data.mean[0];
  const obsPct = ((data.mean[1] * xLast) / level) * 100;
  const obsSe = ((Math.sqrt(data.cov[2]) * xLast) / level) * 100;
  const expPct = FORECAST_PRIOR_SLOPE * xLast * 100;
  const expSd = FORECAST_PRIOR_SLOPE_SD * xLast * 100;
  const observed = { pct: round(obsPct, 1), low80: round(obsPct - Z_80 * obsSe, 1), high80: round(obsPct + Z_80 * obsSe, 1) };
  const expected = { pct: round(expPct, 1), low80: round(expPct - Z_80 * expSd, 1), high80: round(expPct + Z_80 * expSd, 1) };
  const verdict = observed.low80 > expected.high80 ? "ahead" : observed.high80 < expected.low80 ? "behind" : "on-track";
  return { spanWeeks: round(diffDays(used[0]!.localDate, used[used.length - 1]!.localDate) / 7, 1), observed, expected, verdict };
}
