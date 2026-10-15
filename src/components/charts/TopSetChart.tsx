"use client";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Modality } from "@/contracts/enums";
import { fromKg, type WeightUnit } from "@/lib/units";
import type { TopSetPoint } from "@/server/queries/progress.shape";
import { dayNumber, formatDay, modalityColor, modalityShape, unitLabel } from "./format";
import { Mark } from "./markers";

interface Row {
  t: number;
  weight: number;
  reps: number;
}

export interface TopSetChartProps {
  points: TopSetPoint[];
  modality: Modality;
  unit: WeightUnit;
}

function TopSetTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Row }[]; unit: WeightUnit }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="chart-tooltip num" role="presentation">
      <div className="chart-tooltip__title">{formatDay(row.t, true)}</div>
      <div>
        Top set: <strong>{row.weight} {unitLabel(unit)} × {row.reps}</strong>
      </div>
    </div>
  );
}

/** Heaviest working set of each session (effective load). */
export function TopSetChart({ points, modality, unit }: TopSetChartProps) {
  const rows: Row[] = points.map((p) => ({ t: dayNumber(p.localDate), weight: Math.round(fromKg(p.weightKg, unit) * 10) / 10, reps: p.reps }));
  const color = modalityColor(modality);
  const shape = modalityShape(modality);
  return (
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v: number) => formatDay(v)} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} tickCount={5} minTickGap={24} />
          <YAxis domain={[(min: number) => Math.floor(min * 0.9), (max: number) => Math.ceil(max * 1.05)]} tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
          <Tooltip content={<TopSetTooltip unit={unit} />} cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }} isAnimationActive={false} />
          <Line
            dataKey="weight"
            type="stepAfter"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; payload?: Row }) =>
              p.cx == null || p.cy == null ? <g key={`d-${p.payload?.t}`} /> : <g key={`d-${p.payload?.t}`}><Mark cx={p.cx} cy={p.cy} color={color} shape={shape} r={4} /></g>
            }
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
