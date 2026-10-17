import { ChartFrame } from "@/components/charts/ChartFrame";
import { dayNumber, formatDate } from "@/components/charts/format";
import { axisTicks, CHART_WEEKS, TILE_LIFT_LABEL, type LiftChartData } from "@/lib/analytics/lifts";
import { formatNumber, fromKg, type WeightUnit } from "@/lib/units";

const unitText = (unit: WeightUnit) => (unit === "LB" ? "lb" : "kg");

/**
 * The 12-week estimated-1RM chart for one lift (the one that most needs attention). Server-rendered: the plot is fluid HTML
 * over a stretched SVG (lines and the band), so text and markers keep their real size at any width. The stall band is shaded in
 * the accent colour and labelled; the series wears the lift's plate colour. Axis text and gridlines use the theme's muted and
 * hairline tokens, which are checked in both themes. A table view sits under the chart (ChartFrame).
 */
export function E1rmChart({ chart, unit }: { chart: LiftChartData | null; unit: WeightUnit }) {
  const name = chart?.name ?? TILE_LIFT_LABEL.BENCH_PRESS;
  const title = `${name} e1RM · ${CHART_WEEKS} weeks`;
  const u = unitText(unit);
  const pts = chart?.points ?? [];

  if (!chart || pts.length === 0) {
    return (
      <ChartFrame
        title={title}
        summary={`No ${name.toLowerCase()} sessions in the last ${CHART_WEEKS} weeks.`}
        state="empty"
        empty={{ title: "No estimate to chart yet", description: "Log a set of a main lift and your estimated 1RM appears here week by week." }}
        table={null}
        className="today-chart-frame"
        testId="e1rm-chart"
      />
    );
  }

  const values = pts.map((p) => fromKg(p.e1rmKg, unit));
  const ticks = axisTicks(Math.min(...values), Math.max(...values));
  const y0 = ticks[0]!;
  const y1 = ticks.at(-1)!;
  const x0 = dayNumber(chart.from);
  const x1 = dayNumber(chart.to);
  const px = (date: string) => Math.min(100, Math.max(0, ((dayNumber(date) - x0) / (x1 - x0)) * 100));
  const py = (v: number) => (y1 === y0 ? 50 : (1 - (v - y0) / (y1 - y0)) * 100);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${px(p.localDate).toFixed(2)},${py(values[i]!).toFixed(2)}`).join("");
  const band = chart.band;
  const bandL = band ? px(band.from) : 0;
  const bandR = band ? px(band.to) : 0;
  const first = values[0]!;
  const last = values.at(-1)!;
  const delta = Math.round((last - first) * 10) / 10;
  const summary = `Estimated one-rep max for ${name.toLowerCase()} over the last ${CHART_WEEKS} weeks, ${pts.length} ${pts.length === 1 ? "session" : "sessions"}: ${formatNumber(first, 1)} ${u} on ${formatDate(pts[0]!.localDate)}, ${formatNumber(last, 1)} ${u} on ${formatDate(pts.at(-1)!.localDate)}${delta === 0 ? "" : `, ${delta > 0 ? "up" : "down"} ${formatNumber(Math.abs(delta), 1)} ${u}`}.${band ? ` The shaded stretch marks the last ${band.weeks} weeks, where the estimate has been flat.` : ""}`;
  const xLabels: [string, number, "start" | "middle" | "end"][] = [
    [formatDate(chart.from), 0, "start"],
    [formatDate(new Date((x0 + (x1 - x0) / 2) * 86_400_000).toISOString().slice(0, 10)), 50, "middle"],
    [formatDate(chart.to), 100, "end"],
  ];

  return (
    <ChartFrame
      title={title}
      summary={summary}
      table={{ caption: title, columns: ["Date", `e1RM (${u})`], rows: pts.map((p, i) => [formatDate(p.localDate, true), formatNumber(values[i]!, 1)]) }}
      className="today-chart-frame"
      testId="e1rm-chart"
    >
      <div className="today-chart" data-lift={chart.lift} data-stalled={chart.stalled || undefined}>
        <div className="today-chart__area">
          <svg className="today-chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {ticks.map((t) => (
              <line key={t} className="today-chart__grid" x1="0" x2="100" y1={py(t)} y2={py(t)} vectorEffect="non-scaling-stroke" />
            ))}
            {band ? <rect className="today-chart__band" x={bandL} y="0" width={bandR - bandL} height="100" /> : null}
            {pts.length > 1 ? <path className="today-chart__line" d={line} vectorEffect="non-scaling-stroke" /> : null}
          </svg>
          {ticks.map((t) => (
            <span key={t} className="today-chart__ytick num" style={{ top: `${py(t)}%` }} aria-hidden="true">
              {formatNumber(t, 1)}
            </span>
          ))}
          {band ? (
            <span className="today-chart__bandlabel type-label" style={{ left: `${bandL}%` }} aria-hidden="true">
              Flat {band.weeks} wk
            </span>
          ) : null}
          {pts.map((p, i) => (
            <span
              key={p.localDate}
              className={`today-chart__dot${i === pts.length - 1 ? " today-chart__dot--last" : ""}${p.isDeload ? " today-chart__dot--deload" : ""}`}
              style={{ left: `${px(p.localDate)}%`, top: `${py(values[i]!)}%` }}
              title={`${formatDate(p.localDate, true)}: ${formatNumber(values[i]!, 1)} ${u}${p.isDeload ? " (deload)" : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <div className="today-chart__xaxis" aria-hidden="true">
          {xLabels.map(([text, at, anchor]) => (
            <span key={at} className={`today-chart__xtick today-chart__xtick--${anchor} num`} style={{ left: `${at}%` }}>
              {text}
            </span>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}
