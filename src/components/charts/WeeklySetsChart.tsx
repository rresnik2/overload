import type { MuscleVolume } from "@/contracts/analytics";
import { MUSCLE_LABEL } from "@/components/exercises/labels";
import { ChartFrame } from "./ChartFrame";
import { formatDate, plural } from "./format";

const STATUS_TEXT: Record<MuscleVolume["status"], string> = {
  none: "No sets",
  below: "Below the band",
  within: "In the band",
  above: "Above the band",
};

export interface WeeklySetsChartProps {
  weekStart: string;
  muscles: MuscleVolume[];
  title?: string;
  /** Limit the list (the Today card shows the top few). */
  limit?: number;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * Fractional hard sets per muscle for one ISO week against the landmark band (the shaded stretch of each track). Plain HTML bars:
 * status is always written out ("Below the band"), never colour alone. Server-renderable.
 */
export function WeeklySetsChart({ weekStart, muscles, title = "Weekly sets per muscle", limit }: WeeklySetsChartProps) {
  const shown = limit ? muscles.slice(0, limit) : muscles;
  const band = shown[0]?.band ?? { low: 10, high: 20 };
  const max = Math.max(band.high * 1.25, ...shown.map((m) => m.fractionalSets), 1);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const summary =
    shown.length === 0
      ? `No hard sets logged in the week of ${formatDate(weekStart)}.`
      : `Hard sets per muscle in the week of ${formatDate(weekStart)}, counting primary muscles as 1 and secondary as 0.5. The target band is ${band.low} to ${band.high} sets per week. ${shown
          .map((m) => `${MUSCLE_LABEL[m.muscle]}: ${fmt(m.fractionalSets)} (${STATUS_TEXT[m.status].toLowerCase()})`)
          .join("; ")}.`;

  return (
    <ChartFrame
      title={title}
      summary={summary}
      state={shown.length === 0 ? "empty" : "ready"}
      empty={{ title: "No hard sets this week", description: "Log a workout and your weekly sets per muscle will show up here." }}
      table={{
        caption: `${title}, week of ${formatDate(weekStart)}`,
        columns: ["Muscle", "Fractional sets", "Hard sets", "Direct", "Indirect", "Band", "Status"],
        rows: shown.map((m) => [MUSCLE_LABEL[m.muscle], fmt(m.fractionalSets), m.hardSets, m.directSets, m.indirectSets, `${m.band.low}–${m.band.high}`, STATUS_TEXT[m.status]]),
      }}
      legend={[
        { label: "Fractional sets", color: "var(--chart-free-weight)", kind: "square" },
        { label: `Target band ${band.low}–${band.high} sets`, color: "var(--chart-forecast)", kind: "band", opacity: 0.35 },
      ]}
    >
      <ul className="weekly-sets" data-testid="weekly-sets">
        {shown.map((m) => (
          <li key={m.muscle} className="weekly-sets__row" data-status={m.status}>
            <span className="weekly-sets__label">{MUSCLE_LABEL[m.muscle]}</span>
            <span className="weekly-sets__track" aria-hidden="true">
              <span className="weekly-sets__band" style={{ left: pct(m.band.low), width: `calc(${pct(m.band.high)} - ${pct(m.band.low)})` }} />
              <span className="weekly-sets__bar" style={{ width: pct(m.fractionalSets) }} />
            </span>
            <span className="weekly-sets__value num">
              {fmt(m.fractionalSets)} <span className="weekly-sets__status">{STATUS_TEXT[m.status]}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="weekly-sets__note">{plural(shown.length, "muscle")} with volume. Bar = sets; shaded = landmark band.</p>
    </ChartFrame>
  );
}
