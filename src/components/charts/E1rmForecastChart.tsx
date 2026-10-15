"use client";
// Per-series e1RM history with the forecast: a dashed median line, the 80% band at 12% opacity and the 50% band at 22%.
// The forecast is drawn only when the model returned status "ok" (>= 6 sessions over >= 3 weeks); otherwise the caller shows
// the "needs 6 sessions" state. Never extrapolates past the 12 weeks the model returns.
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Modality } from "@/contracts/enums";
import { fromKg, type WeightUnit } from "@/lib/units";
import type { E1rmPoint, ForecastView } from "@/server/queries/progress.shape";
import { dayNumber, formatDay, modalityColor, modalityShape, unitLabel, weightText } from "./format";
import { Mark, PrStar } from "./markers";

interface Row {
  t: number;
  e1rm?: number;
  pr?: boolean;
  deload?: boolean;
  p50?: number;
  band50?: [number, number];
  band80?: [number, number];
}

export interface E1rmForecastChartProps {
  points: E1rmPoint[];
  forecast: ForecastView;
  modality: Modality;
  unit: WeightUnit;
  /** Series name for the tooltip ("Leg press · Gym A"). */
  label: string;
}

const conv = (kg: number, unit: WeightUnit) => Math.round(fromKg(kg, unit) * 10) / 10;

export function buildE1rmRows(points: E1rmPoint[], forecast: ForecastView, unit: WeightUnit): Row[] {
  const rows: Row[] = points.map((p) => ({ t: dayNumber(p.localDate), e1rm: conv(p.e1rmKg, unit), pr: p.isPr, deload: p.isDeload }));
  if (forecast.status !== "ok" || rows.length === 0) return rows;
  // the forecast fans out from the last observed session
  const last = rows[rows.length - 1]!;
  last.p50 = last.e1rm;
  last.band50 = [last.e1rm!, last.e1rm!];
  last.band80 = [last.e1rm!, last.e1rm!];
  for (const f of forecast.points) {
    const t = dayNumber(f.localDate);
    if (t <= last.t) continue;
    rows.push({
      t,
      p50: conv(f.p50, unit),
      band50: [conv(f.low50, unit), conv(f.high50, unit)],
      band80: [conv(f.low80, unit), conv(f.high80, unit)],
    });
  }
  return rows;
}

function ChartTooltip({ active, payload, unit, label }: { active?: boolean; payload?: { payload: Row }[]; unit: WeightUnit; label: string }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  const u = unitLabel(unit);
  return (
    <div className="chart-tooltip num" role="presentation">
      <div className="chart-tooltip__title">{formatDay(row.t, true)}</div>
      {row.e1rm != null ? (
        <div>
          {label}: <strong>{row.e1rm} {u}</strong>
          {row.pr ? " · record" : ""}
          {row.deload ? " · deload" : ""}
        </div>
      ) : null}
      {row.e1rm == null && row.p50 != null ? (
        <>
          <div>Forecast: <strong>{row.p50} {u}</strong></div>
          {row.band50 ? <div>50% range: {row.band50[0]}–{row.band50[1]} {u}</div> : null}
          {row.band80 ? <div>80% range: {row.band80[0]}–{row.band80[1]} {u}</div> : null}
        </>
      ) : null}
    </div>
  );
}

export function E1rmForecastChart({ points, forecast, modality, unit, label }: E1rmForecastChartProps) {
  const rows = buildE1rmRows(points, forecast, unit);
  const color = modalityColor(modality);
  const shape = modalityShape(modality);
  const lastSessionT = points.length ? dayNumber(points[points.length - 1]!.localDate) : null;
  const hasForecast = forecast.status === "ok";

  return (
    <div className="chart-plot chart-plot--tall">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => formatDay(v)}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            tickCount={5}
            minTickGap={24}
          />
          <YAxis
            domain={[(min: number) => Math.floor(min * 0.95), (max: number) => Math.ceil(max * 1.03)]}
            tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={44}
            allowDecimals={false}
          />
          <Tooltip content={<ChartTooltip unit={unit} label={label} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} isAnimationActive={false} />
          {hasForecast && lastSessionT != null ? (
            <ReferenceLine x={lastSessionT} stroke="var(--chart-grid)" strokeWidth={1} label={{ value: "Forecast", position: "insideTopRight", fill: "var(--chart-axis)", fontSize: 12 }} />
          ) : null}
          {hasForecast ? (
            <>
              <Area dataKey="band80" type="monotone" stroke="none" fill="var(--chart-forecast)" fillOpacity={0.12} isAnimationActive={false} activeDot={false} legendType="none" />
              <Area dataKey="band50" type="monotone" stroke="none" fill="var(--chart-forecast)" fillOpacity={0.22} isAnimationActive={false} activeDot={false} legendType="none" />
              <Line dataKey="p50" type="monotone" stroke="var(--chart-forecast)" strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} />
            </>
          ) : null}
          <Line
            dataKey="e1rm"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            isAnimationActive={false}
            connectNulls={false}
            dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
              const key = `d-${p.payload?.t ?? p.index}`;
              if (p.cx == null || p.cy == null || p.payload?.e1rm == null) return <g key={key} />;
              return (
                <g key={key}>
                  {p.payload.pr ? <PrStar cx={p.cx} cy={p.cy} /> : <Mark cx={p.cx} cy={p.cy} color={color} shape={shape} hollow={p.payload.deload} />}
                </g>
              );
            }}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
