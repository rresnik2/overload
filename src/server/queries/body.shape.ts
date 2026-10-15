// Pure shaping for the body page (no Prisma): weight trend, body fat with its method, circumferences and FFMI as a range.
import type { BodyMetricFact } from "@/contracts/analytics";
import type { BodyFatMethod, Sex } from "@/contracts/enums";
import type { BodyMetricRow } from "@/contracts/entities";
import { diffDays, type LocalDate } from "@/lib/dates";
import { bodyweightPoints, bodyweightTrend, ffmi, navyBodyFat, resolveBodyFat } from "@/lib/analytics/scores";
import { round } from "@/lib/units";

export const BODY_HISTORY_DAYS = 365;

export const CIRCUMFERENCE_SITES = ["neckCm", "waistCm", "hipCm", "chestCm", "armCm", "thighCm", "calfCm"] as const;
export type CircumferenceSite = (typeof CIRCUMFERENCE_SITES)[number];

export interface BodyEntry {
  id: string;
  localDate: LocalDate;
  measuredAt: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  bodyFatMethod: BodyFatMethod | null;
  neckCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  calfCm: number | null;
  notes: string | null;
}

export interface WeightPoint {
  localDate: LocalDate;
  weightKg: number;
  trendKg: number;
}

export interface BodyFatPoint {
  localDate: LocalDate;
  pct: number;
  /** null = entered without naming a method. */
  method: BodyFatMethod | null;
}

export interface CircumferenceRow {
  site: CircumferenceSite;
  latestCm: number;
  latestDate: LocalDate;
  /** Change since the previous measurement of the same site (cm); null when there is only one. */
  deltaCm: number | null;
}

export interface FfmiView {
  ffmi: number;
  normalizedFfmi: number;
  range: { low: number; high: number };
  leanMassKg: number;
  weightKg: number;
  bodyFatPct: number;
  method: BodyFatMethod;
  /** Date of the body-fat measurement the figure is based on. */
  bodyFatDate: LocalDate;
}

export interface BodyView {
  today: LocalDate;
  sex: Sex | null;
  heightCm: number | null;
  /** Newest first, for the history list (edit / delete). */
  entries: BodyEntry[];
  weight: {
    points: WeightPoint[];
    latestKg: number | null;
    trendKg: number | null;
    /** Trend now minus the trend ~28 days earlier (kg); null with less than 4 weeks of data. */
    trend28dKg: number | null;
  };
  bodyFat: { resolved: { pct: number; method: BodyFatMethod; localDate: LocalDate } | null; history: BodyFatPoint[] };
  ffmi: FfmiView | null;
  circumferences: CircumferenceRow[];
}

export function bodyEntry(row: BodyMetricRow): BodyEntry {
  return {
    id: row.id,
    localDate: row.localDate,
    measuredAt: row.measuredAt,
    weightKg: row.weightKg,
    bodyFatPct: row.bodyFatPct,
    bodyFatMethod: row.bodyFatMethod,
    neckCm: row.neckCm,
    waistCm: row.waistCm,
    hipCm: row.hipCm,
    chestCm: row.chestCm,
    armCm: row.armCm,
    thighCm: row.thighCm,
    calfCm: row.calfCm,
    notes: row.notes,
  };
}

const toFact = (e: BodyEntry): BodyMetricFact => ({
  localDate: e.localDate,
  weightKg: e.weightKg,
  bodyFatPct: e.bodyFatPct,
  bodyFatMethod: e.bodyFatMethod,
  neckCm: e.neckCm,
  waistCm: e.waistCm,
  hipCm: e.hipCm,
  chestCm: e.chestCm,
  armCm: e.armCm,
  thighCm: e.thighCm,
  calfCm: e.calfCm,
});

export function buildBodyView(input: { entries: BodyEntry[]; sex: Sex | null; heightCm: number | null; today: LocalDate }): BodyView {
  const { sex, heightCm, today } = input;
  // oldest first for the series maths; the list shown to the user is newest first
  const asc = [...input.entries].sort((a, b) => a.localDate.localeCompare(b.localDate) || a.measuredAt.localeCompare(b.measuredAt));
  const facts = asc.map(toFact);

  const raw = bodyweightPoints(facts);
  const trend = bodyweightTrend(raw);
  const points: WeightPoint[] = raw.map((p, i) => ({ localDate: p.localDate, weightKg: p.weightKg, trendKg: trend[i]!.trendKg }));
  const lastPoint = points.at(-1) ?? null;
  const earlier = lastPoint ? points.findLast((p) => diffDays(p.localDate, lastPoint.localDate) >= 28) : undefined;

  const resolved = resolveBodyFat(facts, { sex, heightCm });
  const navySex = sex === "MALE" || sex === "FEMALE" ? sex : null;
  const history: BodyFatPoint[] = [];
  for (const e of asc) {
    if (e.bodyFatPct != null) {
      history.push({ localDate: e.localDate, pct: e.bodyFatPct, method: e.bodyFatMethod });
    } else if (navySex && heightCm != null && e.neckCm != null && e.waistCm != null) {
      const pct = navyBodyFat({ sex: navySex, heightCm, neckCm: e.neckCm, waistCm: e.waistCm, hipCm: e.hipCm });
      if (pct != null) history.push({ localDate: e.localDate, pct, method: "NAVY_TAPE" });
    }
  }

  let ffmiView: FfmiView | null = null;
  if (resolved && heightCm != null && lastPoint) {
    const r = ffmi({ weightKg: lastPoint.weightKg, heightCm, bodyFatPct: resolved.pct });
    ffmiView = {
      ffmi: r.ffmi,
      normalizedFfmi: r.normalizedFfmi,
      range: r.range,
      leanMassKg: r.leanMassKg,
      weightKg: lastPoint.weightKg,
      bodyFatPct: resolved.pct,
      method: resolved.method,
      bodyFatDate: resolved.localDate,
    };
  }

  const circumferences: CircumferenceRow[] = [];
  for (const site of CIRCUMFERENCE_SITES) {
    const withSite = asc.filter((e) => e[site] != null);
    const latest = withSite.at(-1);
    if (!latest) continue;
    const prev = withSite.at(-2);
    circumferences.push({
      site,
      latestCm: latest[site]!,
      latestDate: latest.localDate,
      deltaCm: prev ? round(latest[site]! - prev[site]!, 1) : null,
    });
  }

  return {
    today,
    sex,
    heightCm,
    entries: [...asc].reverse(),
    weight: {
      points,
      latestKg: lastPoint?.weightKg ?? null,
      trendKg: lastPoint?.trendKg ?? null,
      trend28dKg: lastPoint && earlier ? round(lastPoint.trendKg - earlier.trendKg, 2) : null,
    },
    bodyFat: { resolved, history },
    ffmi: ffmiView,
    circumferences,
  };
}
