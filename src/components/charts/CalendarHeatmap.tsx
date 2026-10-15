import type { Heatmap } from "@/server/queries/progress.shape";
import { ChartFrame } from "./ChartFrame";
import { formatDate, plural } from "./format";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Training calendar: one column per ISO week (Monday first), one square per day, shaded by sets that day (vermilion, light to dark). */
export function CalendarHeatmap({ heatmap, title = "Training calendar" }: { heatmap: Heatmap; title?: string }) {
  const first = heatmap.weeks[0]?.weekStart;
  const last = heatmap.weeks.at(-1)?.cells.findLast((c) => !c.future)?.localDate;
  const summary = `Working sets per day over the last ${heatmap.weeks.length} weeks: ${plural(heatmap.trainingDays, "training day")} and ${plural(heatmap.totalSets, "set")}${first && last ? `, from ${formatDate(first)} to ${formatDate(last)}` : ""}. Darker squares are busier days.`;
  return (
    <ChartFrame
      title={title}
      summary={summary}
      state={heatmap.totalSets === 0 ? "empty" : "ready"}
      empty={{ title: "No workouts in this window", description: "Finish a workout and it shows up here." }}
      table={{
        caption: `${title}: sets per day, by week`,
        columns: ["Week of", ...DAYS],
        rows: heatmap.weeks.map((w) => [formatDate(w.weekStart), ...w.cells.map((c) => (c.future ? "" : c.sets))]),
      }}
      legend={[
        { label: "Rest", color: "var(--chart-grid)", kind: "square" },
        { label: "More sets", color: "var(--chart-free-weight)", kind: "square" },
      ]}
    >
      <div className="heatmap" data-testid="heatmap">
        <div className="heatmap__days" aria-hidden="true">
          {DAYS.map((d, i) => (
            <span key={d} className="heatmap__day">{i % 2 === 0 ? d : ""}</span>
          ))}
        </div>
        <div className="heatmap__grid" style={{ gridTemplateColumns: `repeat(${heatmap.weeks.length}, minmax(0, 1fr))` }}>
          {heatmap.weeks.map((w, wi) => (
            <div key={w.weekStart} className="heatmap__week">
              <span className="heatmap__month" aria-hidden="true">{wi === 0 || w.weekStart.slice(5, 7) !== heatmap.weeks[wi - 1]!.weekStart.slice(5, 7) ? formatDate(w.weekStart).split(" ")[0] : ""}</span>
              {w.cells.map((c) => (
                <span key={c.localDate} className="heatmap__cell" data-level={c.future ? "future" : c.level} title={c.future ? undefined : `${formatDate(c.localDate)}: ${plural(c.sets, "set")}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </ChartFrame>
  );
}
