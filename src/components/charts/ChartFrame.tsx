import clsx from "clsx";
import { Info } from "lucide-react";
import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";

export interface ChartTable {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface LegendItem {
  label: string;
  /** A CSS colour (use the --chart-* variables). */
  color: string;
  /** line | dashed | band | marker | star: the swatch shape, so identity never rides on colour alone. */
  kind?: "line" | "dashed" | "band" | "dot" | "square" | "diamond" | "triangle" | "star";
  opacity?: number;
}

export interface ChartFrameProps {
  title: string;
  /** Plain-language description of what the chart shows (read by screen readers via aria-describedby, also shown). */
  summary: ReactNode;
  /** ready (default) | loading (skeleton) | empty (nothing to plot) | low-data (chart + a "needs N sessions" note). */
  state?: "ready" | "loading" | "empty" | "low-data";
  /** Shown instead of the chart when state is "empty" (say why and what to do). */
  empty?: { title: string; description?: ReactNode; action?: ReactNode };
  /** Shown under the chart when state is "low-data". */
  lowData?: { title: string; description?: ReactNode };
  /** The accessible table fallback: every chart has one. */
  table: ChartTable | null;
  legend?: LegendItem[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Data hook for e2e tests. */
  testId?: string;
}

function Swatch({ item }: { item: LegendItem }) {
  const kind = item.kind ?? "line";
  return <span className={clsx("chart-legend__swatch", `chart-legend__swatch--${kind}`)} style={{ "--swatch": item.color, "--swatch-opacity": item.opacity ?? 1 } as CSSProperties} aria-hidden="true" />;
}

/**
 * The frame every chart sits in: title, a text summary wired with aria-describedby, the plot, a legend (always for 2+ series),
 * loading / empty / low-data states and the table fallback. Renders on the server; the plot itself is a client component.
 */
export function ChartFrame({ title, summary, state = "ready", empty, lowData, table, legend, actions, children, className, testId }: ChartFrameProps) {
  const base = useId();
  const summaryId = `${base}-summary`;
  const tableId = `${base}-table`;
  const showPlot = state === "ready" || state === "low-data";

  return (
    <figure className={clsx("chart-frame", className)} data-chart-state={state} data-testid={testId} aria-busy={state === "loading" || undefined}>
      <div className="chart-frame__head">
        <figcaption className="chart-frame__title">{title}</figcaption>
        {actions ? <div className="chart-frame__actions">{actions}</div> : null}
      </div>
      <p id={summaryId} className="chart-frame__summary">
        {summary}
      </p>

      {state === "loading" ? (
        <div className="chart-frame__skeleton" aria-hidden="true" />
      ) : null}
      {state === "loading" ? <span className="sr-only">Loading chart</span> : null}

      {state === "empty" ? (
        <div className="chart-frame__empty" role="status">
          <p className="chart-frame__empty-title">{empty?.title ?? "Nothing to plot yet"}</p>
          {empty?.description ? <p className="chart-frame__empty-text">{empty.description}</p> : null}
          {empty?.action ? <div className="chart-frame__empty-action">{empty.action}</div> : null}
        </div>
      ) : null}

      {showPlot ? (
        <div className="chart-frame__plot" role="img" aria-label={title} aria-describedby={summaryId}>
          {children}
        </div>
      ) : null}

      {legend && legend.length > 1 ? (
        <ul className="chart-legend" aria-label={`${title}: legend`}>
          {legend.map((item) => (
            <li key={item.label} className="chart-legend__item">
              <Swatch item={item} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}

      {state === "low-data" && lowData ? (
        <div className="chart-frame__lowdata" role="note" data-testid="low-data">
          <Info size={16} aria-hidden="true" className="chart-frame__lowdata-icon" />
          <div>
            <p className="chart-frame__lowdata-title">{lowData.title}</p>
            {lowData.description ? <p className="chart-frame__lowdata-text">{lowData.description}</p> : null}
          </div>
        </div>
      ) : null}

      {table && state !== "loading" ? (
        <details className="chart-frame__table" id={tableId}>
          <summary>View as table</summary>
          <div className="chart-frame__table-scroll" tabIndex={0} role="region" aria-label={`${table.caption} (scrollable)`}>
            <table className="chart-table num">
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) =>
                      j === 0 ? (
                        <th key={j} scope="row">
                          {cell}
                        </th>
                      ) : (
                        <td key={j}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
