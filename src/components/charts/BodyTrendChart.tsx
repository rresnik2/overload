"use client";
// Bodyweight: each weigh-in as a small marker, the time-decayed trend as the 2px line (the trend is the signal, the daily
// number is noise). Optionally a body-fat % chart with the measurement method in the tooltip.
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { fromKg, type WeightUnit } from "@/lib/units";
import type { BodyFatPoint, WeightPoint } from "@/server/queries/body.shape";
import { dayNumber, formatDay, unitLabel } from "./format";
import { Mark } from "./markers";

const COLOR = "var(--chart-bodyweight)";
export const METHOD_LABEL: Record<string, string> = {
  DEXA: "DEXA",
  BIA: "BIA scale",
  CALIPERS: "Calipers",
  NAVY_TAPE: "Navy tape",
  SCALE: "Scale estimate",
  BMI_ESTIMATE: "BMI estimate",
};

interface WRow {
  t: number;
  weight: number;
  trend: number;
}

function WeightTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: WRow }[]; unit: WeightUnit }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="chart-tooltip num" role="presentation">
      <div className="chart-tooltip__title">{formatDay(row.t, true)}</div>
      <div>Weigh-in: <strong>{row.weight} {unitLabel(unit)}</strong></div>
      <div>Trend: <strong>{row.trend} {unitLabel(unit)}</strong></div>
    </div>
  );
}

export function WeightTrendChart({ points, unit }: { points: WeightPoint[]; unit: WeightUnit }) {
  const r = (kg: number) => Math.round(fromKg(kg, unit) * 10) / 10;
  const rows: WRow[] = points.map((p) => ({ t: dayNumber(p.localDate), weight: r(p.weightKg), trend: r(p.trendKg) }));
  return (
    <div className="chart-plot chart-plot--tall">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatDay(v)} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} tickCount={5} minTickGap={24} />
          <YAxis domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
          <Tooltip content={<WeightTooltip unit={unit} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} isAnimationActive={false} />
          <Scatter dataKey="weight" fill={COLOR} isAnimationActive={false} legendType="none" shape={(p: { cx?: number; cy?: number }) => (p.cx == null || p.cy == null ? <g /> : <circle cx={p.cx} cy={p.cy} r={2.5} fill={COLOR} fillOpacity={0.45} />)} />
          <Line dataKey="trend" type="monotone" stroke={COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface BRow {
  t: number;
  pct: number;
  method: string;
}

function BodyFatTooltip({ active, payload }: { active?: boolean; payload?: { payload: BRow }[] }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="chart-tooltip num" role="presentation">
      <div className="chart-tooltip__title">{formatDay(row.t, true)}</div>
      <div>Body fat: <strong>{row.pct}%</strong></div>
      <div>{row.method}</div>
    </div>
  );
}

export function BodyFatChart({ points }: { points: BodyFatPoint[] }) {
  const rows: BRow[] = points.map((p) => ({ t: dayNumber(p.localDate), pct: Math.round(p.pct * 10) / 10, method: p.method ? (METHOD_LABEL[p.method] ?? p.method) : "Method not recorded" }));
  return (
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatDay(v)} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} tickCount={5} minTickGap={24} />
          <YAxis domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} unit="%" />
          <Tooltip content={<BodyFatTooltip />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} isAnimationActive={false} />
          <Line
            dataKey="pct"
            type="monotone"
            stroke={COLOR}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; payload?: BRow }) => (p.cx == null || p.cy == null ? <g key={`b-${p.payload?.t}`} /> : <g key={`b-${p.payload?.t}`}><Mark cx={p.cx} cy={p.cy} color={COLOR} shape="circle" r={4} /></g>)}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
