import { BodyFatChart, WeightTrendChart } from "@/components/charts/BodyTrendChart";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { formatDate, METHOD_LABEL, plural, unitLabel, weightText } from "@/components/charts/format";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { InfoHint } from "@/components/ui/InfoHint";
import { Stat } from "@/components/ui/Stat";
import { fromKg, type WeightUnit } from "@/lib/units";
import type { BodyView } from "@/server/queries/body.shape";

const SITE_LABEL = { neckCm: "Neck", waistCm: "Waist", hipCm: "Hip", chestCm: "Chest", armCm: "Arm", thighCm: "Thigh", calfCm: "Calf" } as const;

const signed = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;

/** Weight trend + body-fat charts, FFMI (always a range) and circumferences. Server-renderable. */
export function BodySections({ view, unit }: { view: BodyView; unit: WeightUnit }) {
  const u = unitLabel(unit);
  const { weight, bodyFat, ffmi, circumferences } = view;
  const first = weight.points[0];
  const last = weight.points.at(-1);

  const weightSummary = last
    ? `Bodyweight over ${plural(weight.points.length, "weigh-in")}, ${formatDate(first!.localDate)} to ${formatDate(last.localDate, true)}. Latest ${weightText(last.weightKg, unit)} ${u}; the smoothed trend is ${weightText(last.trendKg, unit)} ${u}${weight.trend28dKg != null ? `, ${signed(fromKg(weight.trend28dKg, unit))} ${u} over the last 4 weeks` : ""}.`
    : "No weigh-ins yet.";

  const bfLast = bodyFat.history.at(-1);
  const bfSummary = bfLast
    ? `Body fat percentage over ${plural(bodyFat.history.length, "measurement")}. Latest ${bfLast.pct.toFixed(1)}% on ${formatDate(bfLast.localDate, true)}${bfLast.method ? ` (${METHOD_LABEL[bfLast.method] ?? bfLast.method})` : ""}.`
    : "No body-fat measurements yet.";

  return (
    <>
      <section aria-labelledby="body-weight" className="progress-section">
        <SectionHeader id="body-weight" index={1} title="Weight trend" actions={<InfoHint term="bodyweightTrend" />} />
        <div className="progress-stats">
          <Stat label="Weight" value={weight.latestKg != null ? weightText(weight.latestKg, unit) : "–"} unit={weight.latestKg != null ? u : undefined} />
          <Stat label="Trend" value={weight.trendKg != null ? weightText(weight.trendKg, unit) : "–"} unit={weight.trendKg != null ? u : undefined} note={weight.trend28dKg != null ? `${signed(fromKg(weight.trend28dKg, unit))} ${u} / 4 weeks` : "needs 4 weeks of weigh-ins"} />
          <Stat
            label={bodyFat.resolved ? `Body fat (${METHOD_LABEL[bodyFat.resolved.method] ?? bodyFat.resolved.method})` : "Body fat"}
            value={bodyFat.resolved ? bodyFat.resolved.pct.toFixed(1) : "–"}
            unit={bodyFat.resolved ? "%" : undefined}
            note={bodyFat.resolved ? formatDate(bodyFat.resolved.localDate, true) : "log a measurement"}
          />
        </div>
        <ChartFrame
          testId="chart-weight"
          title={`Bodyweight (${u})`}
          summary={weightSummary}
          state={weight.points.length === 0 ? "empty" : "ready"}
          empty={{ title: "No weigh-ins yet", description: "Log your weight below. The trend line smooths daily swings." }}
          table={weight.points.length ? { caption: "Bodyweight and trend", columns: ["Date", `Weight (${u})`, `Trend (${u})`], rows: weight.points.map((p) => [formatDate(p.localDate, true), weightText(p.weightKg, unit), weightText(p.trendKg, unit)]) } : null}
          legend={[
            { label: "Weigh-in", color: "var(--chart-bodyweight)", kind: "dot", opacity: 0.45 },
            { label: "Trend (7-day half-life)", color: "var(--chart-bodyweight)", kind: "line" },
          ]}
        >
          <WeightTrendChart points={weight.points} unit={unit} />
        </ChartFrame>
      </section>

      <section aria-labelledby="body-fat" className="progress-section">
        <SectionHeader id="body-fat" index={2} title="Body fat" actions={<InfoHint term="bodyFatMethods" />} />
        <ChartFrame
          testId="chart-bodyfat"
          title="Body fat (%)"
          summary={bfSummary}
          state={bodyFat.history.length === 0 ? "empty" : "ready"}
          empty={{ title: "No body-fat measurements", description: "Enter a body-fat % with its method, or use the tape calculator below." }}
          table={bodyFat.history.length ? { caption: "Body fat measurements", columns: ["Date", "Body fat (%)", "Method"], rows: bodyFat.history.map((p) => [formatDate(p.localDate, true), p.pct.toFixed(1), p.method ? (METHOD_LABEL[p.method] ?? p.method) : "Not recorded"]) } : null}
        >
          <BodyFatChart points={bodyFat.history} />
        </ChartFrame>
        <p className="progress-note">Methods differ by a few percentage points, so compare like with like. Priority for the headline figure: DEXA, then BIA or calipers, then tape, then scale.</p>
      </section>

      <section aria-labelledby="body-ffmi" className="progress-section">
        <SectionHeader id="body-ffmi" index={3} title="Fat-free mass index" actions={<InfoHint term="ffmi" />} />
        {ffmi ? (
          <div data-testid="ffmi">
            <div className="progress-stats">
              <Stat label="FFMI range" value={`${ffmi.range.low.toFixed(1)}–${ffmi.range.high.toFixed(1)}`} note={`best estimate ${ffmi.ffmi.toFixed(1)}, normalized to 1.8 m: ${ffmi.normalizedFfmi.toFixed(1)}`} />
              <Stat label="Lean mass" value={weightText(ffmi.leanMassKg, unit)} unit={u} />
            </div>
            <p className="progress-note">
              Shown as a range because body-fat error carries through: it is computed with body fat 4 points higher and lower than the {ffmi.bodyFatPct.toFixed(1)}% measured by {METHOD_LABEL[ffmi.method] ?? ffmi.method} on {formatDate(ffmi.bodyFatDate, true)}.
            </p>
          </div>
        ) : (
          <p className="progress-note" data-testid="ffmi-empty">FFMI needs your height (Settings / Profile), a weigh-in and a body-fat measurement.</p>
        )}
      </section>

      <section aria-labelledby="body-circ" className="progress-section">
        <SectionHeader id="body-circ" index={4} title="Circumferences" actions={<InfoHint term="navyTape" />} />
        {circumferences.length === 0 ? (
          <p className="progress-note">No tape measurements yet.</p>
        ) : (
          <div className="chart-frame__table-scroll" tabIndex={0} role="region" aria-label="Circumferences (scrollable)">
            <table className="chart-table num" data-testid="circumferences">
              <caption className="sr-only">Latest tape measurements and change since the previous one</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Latest (cm)</th>
                  <th scope="col">Change</th>
                  <th scope="col">Measured</th>
                </tr>
              </thead>
              <tbody>
                {circumferences.map((c) => (
                  <tr key={c.site}>
                    <th scope="row">{SITE_LABEL[c.site]}</th>
                    <td>{c.latestCm}</td>
                    <td>{c.deltaCm == null ? "–" : `${signed(c.deltaCm)} cm`}</td>
                    <td>{formatDate(c.latestDate, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
