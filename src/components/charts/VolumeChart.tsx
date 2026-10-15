"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Modality } from "@/contracts/enums";
import { fromKg, type WeightUnit } from "@/lib/units";
import type { VolumePoint } from "@/server/queries/progress.shape";
import { dayNumber, formatDay, modalityColor, unitLabel } from "./format";

interface Row {
  label: string;
  t: number;
  volume: number;
  sets: number;
}

export interface VolumeChartProps {
  points: VolumePoint[];
  modality: Modality;
  unit: WeightUnit;
}

function VolumeTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: Row }[]; unit: WeightUnit }) {
  const row = active ? payload?.[0]?.payload : undefined;
  if (!row) return null;
  return (
    <div className="chart-tooltip num" role="presentation">
      <div className="chart-tooltip__title">{formatDay(row.t, true)}</div>
      <div>
        Volume: <strong>{row.volume.toLocaleString("en-US")} {unitLabel(unit)}</strong>
      </div>
      <div>{row.sets} working sets</div>
    </div>
  );
}

/** Session volume (effective load x reps over working sets): columns <= 24px wide, 4px rounded tops, square at the baseline. */
export function VolumeChart({ points, modality, unit }: VolumeChartProps) {
  const rows: Row[] = points.map((p) => ({ label: formatDay(dayNumber(p.localDate)), t: dayNumber(p.localDate), volume: Math.round(fromKg(p.volumeKg, unit)), sets: p.sets }));
  return (
    <div className="chart-plot">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} margin={{ top: 12, right: 12, bottom: 4, left: 0 }} barCategoryGap="20%" accessibilityLayer={false}>
          <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={{ stroke: "var(--chart-grid)" }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 12 }} axisLine={false} tickLine={false} width={52} allowDecimals={false} tickFormatter={(v: number) => v.toLocaleString("en-US")} />
          <Tooltip content={<VolumeTooltip unit={unit} />} cursor={{ fill: "var(--chart-grid)", fillOpacity: 0.5 }} isAnimationActive={false} />
          <Bar dataKey="volume" fill={modalityColor(modality)} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
