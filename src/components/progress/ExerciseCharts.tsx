import { E1rmForecastChart } from "@/components/charts/E1rmForecastChart";
import { InfoHint } from "@/components/ui/InfoHint";
import { Term } from "@/components/ui/Term";
import { ChartFrame, type LegendItem } from "@/components/charts/ChartFrame";
import { TopSetChart } from "@/components/charts/TopSetChart";
import { VolumeChart } from "@/components/charts/VolumeChart";
import { modalityColor, unitLabel } from "@/components/charts/format";
import { Stat } from "@/components/ui/Stat";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import type { WeightUnit } from "@/lib/units";
import type { SeriesProgress } from "@/server/queries/progress.shape";
import { weightText, formatDate, plural } from "@/components/charts/format";
import { e1rmSummary, e1rmTable, lowDataCopy, topSetSummary, topSetTable, volumeSummary, volumeTable } from "./summaries";

export interface ExerciseChartsProps {
  exerciseName: string;
  series: SeriesProgress;
  unit: WeightUnit;
}

/** The three charts of one series: e1RM + forecast, top set, volume. Everything comes from this series only; machines never merge. */
export function ExerciseCharts({ exerciseName, series, unit }: ExerciseChartsProps) {
  const { ref, e1rm, forecast, topSets, volume } = series;
  const u = unitLabel(unit);
  const color = modalityColor(ref.modality);
  const label = ref.machineProfileId ? `${exerciseName} (${ref.label})` : exerciseName;

  const e1rmLegend: LegendItem[] = [
    { label: "Estimated 1RM", color, kind: "line" },
    ...(forecast.status === "ok"
      ? ([
          { label: "Forecast (median)", color: "var(--chart-forecast)", kind: "dashed" },
          { label: "50% range", color: "var(--chart-forecast)", kind: "band", opacity: 0.22 },
          { label: "80% range", color: "var(--chart-forecast)", kind: "band", opacity: 0.12 },
        ] satisfies LegendItem[])
      : []),
    ...(e1rm.some((p) => p.isPr) ? ([{ label: "New record", color: "var(--chart-pr)", kind: "star" }] satisfies LegendItem[]) : []),
    ...(e1rm.some((p) => p.isDeload) ? ([{ label: "Deload session", color, kind: "dot", opacity: 0.35 }] satisfies LegendItem[]) : []),
  ];

  return (
    <div className="progress-charts" data-series-key={ref.seriesKey}>
      <section aria-labelledby="pc-e1rm" className="progress-section">
        <SectionHeader id="pc-e1rm" index={1} title="Estimated 1RM" actions={<InfoHint term="e1rm" />} />
        <div className="progress-stats">
          <Stat label="Latest e1RM" value={series.latestE1rmKg != null ? weightText(series.latestE1rmKg, unit) : "–"} unit={series.latestE1rmKg != null ? u : undefined} size="md" />
          <Stat label="Best e1RM" value={series.bestE1rmKg != null ? weightText(series.bestE1rmKg, unit) : "–"} unit={series.bestE1rmKg != null ? u : undefined} size="md" pr={series.bestE1rmKg != null && e1rm.some((p) => p.isPr)} note={series.bestLocalDate ? formatDate(series.bestLocalDate, true) : undefined} />
          <Stat label="Sessions" value={ref.sessions} size="md" note={`last ${formatDate(ref.lastLocalDate, true)}`} />
        </div>
        <ChartFrame
          testId="chart-e1rm"
          title={`Estimated 1RM (${u})`}
          summary={e1rmSummary(label, e1rm, forecast, unit)}
          state={e1rm.length === 0 ? "empty" : forecast.status === "ok" ? "ready" : "low-data"}
          empty={{ title: "No estimated 1RM yet", description: "Working sets of 10 reps or fewer with a load give an estimate. Log one and the chart appears." }}
          lowData={forecast.status === "insufficient" ? { ...lowDataCopy(forecast), hint: "forecastNeedsSessions" } : undefined}
          hint="forecast"
          legendHint="forecastBands"
          table={e1rm.length ? e1rmTable(label, e1rm, forecast, unit) : null}
          legend={e1rmLegend}
        >
          <E1rmForecastChart points={e1rm} forecast={forecast} modality={ref.modality} unit={unit} label={label} />
        </ChartFrame>
        {forecast.status === "ok" ? (
          <p className="progress-note" data-testid="forecast-note">
            Forecast from {plural(forecast.usedSessions, "session")}
            {forecast.excluded.deload ? `, ${plural(forecast.excluded.deload, "deload session")} left out` : ""}
            {forecast.excluded.outliers ? `, ${plural(forecast.excluded.outliers, "outlier")} left out` : ""}. It is a trend estimate, not a promise: the shaded <Term id="forecastBands">bands</Term> show how sure it is.
          </p>
        ) : null}
        {series.strength.percentile ? (
          <p className="progress-note" data-testid="percentile">
            About the {Math.round(series.strength.percentile.percentile)}th percentile ({series.strength.percentile.population}; {series.strength.percentile.source}).
          </p>
        ) : null}
      </section>

      <section aria-labelledby="pc-top" className="progress-section">
        <SectionHeader id="pc-top" index={2} title="Top set" actions={<InfoHint term="topSet" />} />
        <ChartFrame
          testId="chart-topset"
          title={`Top set (${u})`}
          summary={topSetSummary(label, topSets, unit)}
          state={topSets.length === 0 ? "empty" : "ready"}
          empty={{ title: "No loaded sets yet", description: "The heaviest working set of each session is plotted here." }}
          table={topSets.length ? topSetTable(label, topSets, unit) : null}
        >
          <TopSetChart points={topSets} modality={ref.modality} unit={unit} />
        </ChartFrame>
      </section>

      <section aria-labelledby="pc-vol" className="progress-section">
        <SectionHeader id="pc-vol" index={3} title="Volume" actions={<InfoHint term="volumeLoad" />} />
        <ChartFrame
          testId="chart-volume"
          title={`Session volume (${u})`}
          summary={volumeSummary(label, volume, unit)}
          state={volume.length === 0 ? "empty" : "ready"}
          empty={{ title: "No volume yet", description: "Load × reps of your working sets, one column per session." }}
          table={volume.length ? volumeTable(label, volume, unit) : null}
        >
          <VolumeChart points={volume} modality={ref.modality} unit={unit} />
        </ChartFrame>
      </section>
    </div>
  );
}
