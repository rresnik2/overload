// Pure text and table builders for the progress charts (summaries for aria-describedby, table fallbacks, low-data copy).
import type { WeightUnit } from "@/lib/units";
import { formatDate, plural, unitLabel, weightText } from "@/components/charts/format";
import type { ChartTable } from "@/components/charts/ChartFrame";
import type { E1rmPoint, ForecastView, TopSetPoint, VolumePoint } from "@/server/queries/progress.shape";

export function lowDataCopy(f: Extract<ForecastView, { status: "insufficient" }>): { title: string; description: string } {
  const have = `${plural(f.haveSessions, "session")} over ${plural(f.haveWeeks, "week")}`;
  if (f.reason === "layoff") {
    return {
      title: `Needs ${f.needSessions} sessions since your break`,
      description: `You were away for 4 weeks or more, so the forecast restarted. You have ${have} since you came back; ${f.needSessions} sessions over ${f.needWeeks} weeks brings it back.`,
    };
  }
  if (f.reason === "span") {
    return {
      title: `Needs ${f.needSessions} sessions over ${f.needWeeks} weeks`,
      description: `You have ${have}. The forecast waits until the sessions span at least ${f.needWeeks} weeks, so one hard day cannot set the trend.`,
    };
  }
  return {
    title: `Needs ${f.needSessions} sessions for a forecast`,
    description: `You have ${plural(f.haveSessions, "session")} so far. Keep logging: after ${f.needSessions} sessions over ${f.needWeeks} weeks a forecast with 50% and 80% ranges appears here.`,
  };
}

export function e1rmSummary(label: string, points: E1rmPoint[], forecast: ForecastView, unit: WeightUnit): string {
  if (points.length === 0) return `${label}: no estimated 1RM yet.`;
  const u = unitLabel(unit);
  const first = points[0]!;
  const last = points.at(-1)!;
  const best = points.reduce((b, p) => (p.e1rmKg > b.e1rmKg ? p : b), first);
  const records = points.filter((p) => p.isPr).length;
  let text = `${label}: estimated 1RM over ${plural(points.length, "session")}, ${formatDate(first.localDate)} to ${formatDate(last.localDate, true)}. Latest ${weightText(last.e1rmKg, unit)} ${u}; best ${weightText(best.e1rmKg, unit)} ${u} on ${formatDate(best.localDate)}.`;
  if (records > 0) text += ` ${plural(records, "new record")} marked with a star.`;
  if (forecast.status === "ok") {
    const end = forecast.points.at(-1)!;
    text += ` Forecast: about ${weightText(end.p50, unit)} ${u} by ${formatDate(end.localDate)}, 80% range ${weightText(end.low80, unit)} to ${weightText(end.high80, unit)} ${u}.`;
  } else {
    text += ` ${lowDataCopy(forecast).title}.`;
  }
  return text;
}

export function e1rmTable(label: string, points: E1rmPoint[], forecast: ForecastView, unit: WeightUnit): ChartTable {
  const u = unitLabel(unit);
  const rows: (string | number)[][] = points.map((p) => [
    formatDate(p.localDate, true),
    weightText(p.e1rmKg, unit),
    [p.isPr ? "Record" : "", p.isDeload ? "Deload" : ""].filter(Boolean).join(", "),
    "",
    "",
    "",
  ]);
  if (forecast.status === "ok") {
    for (const f of forecast.points) {
      rows.push([
        formatDate(f.localDate, true),
        "",
        "Forecast",
        weightText(f.p50, unit),
        `${weightText(f.low50, unit)}–${weightText(f.high50, unit)}`,
        `${weightText(f.low80, unit)}–${weightText(f.high80, unit)}`,
      ]);
    }
  }
  return { caption: `${label}: estimated 1RM and forecast`, columns: ["Date", `e1RM (${u})`, "Note", `Forecast (${u})`, "50% range", "80% range"], rows };
}

export function topSetSummary(label: string, points: TopSetPoint[], unit: WeightUnit): string {
  if (points.length === 0) return `${label}: no loaded working sets yet.`;
  const first = points[0]!;
  const last = points.at(-1)!;
  const u = unitLabel(unit);
  return `${label}: heaviest working set per session over ${plural(points.length, "session")}. First ${weightText(first.weightKg, unit)} ${u} × ${first.reps} on ${formatDate(first.localDate)}; latest ${weightText(last.weightKg, unit)} ${u} × ${last.reps} on ${formatDate(last.localDate, true)}.`;
}

export function topSetTable(label: string, points: TopSetPoint[], unit: WeightUnit): ChartTable {
  return {
    caption: `${label}: top set per session`,
    columns: ["Date", `Weight (${unitLabel(unit)})`, "Reps"],
    rows: points.map((p) => [formatDate(p.localDate, true), weightText(p.weightKg, unit), p.reps]),
  };
}

export function volumeSummary(label: string, points: VolumePoint[], unit: WeightUnit): string {
  if (points.length === 0) return `${label}: no session volume yet.`;
  const max = points.reduce((b, p) => (p.volumeKg > b.volumeKg ? p : b), points[0]!);
  const last = points.at(-1)!;
  const u = unitLabel(unit);
  return `${label}: volume (load × reps over working sets) for ${plural(points.length, "session")}. Latest ${weightText(last.volumeKg, unit, 0)} ${u} on ${formatDate(last.localDate, true)}; highest ${weightText(max.volumeKg, unit, 0)} ${u} on ${formatDate(max.localDate)}.`;
}

export function volumeTable(label: string, points: VolumePoint[], unit: WeightUnit): ChartTable {
  return {
    caption: `${label}: volume per session`,
    columns: ["Date", `Volume (${unitLabel(unit)})`, "Working sets"],
    rows: points.map((p) => [formatDate(p.localDate, true), weightText(p.volumeKg, unit, 0), p.sets]),
  };
}
