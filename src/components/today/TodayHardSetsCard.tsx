import Link from "next/link";
import { MUSCLE_LABEL } from "@/components/exercises/labels";
import type { MuscleVolume } from "@/contracts/analytics";

const STATUS_TEXT: Record<MuscleVolume["status"], string> = {
  none: "no sets",
  below: "below the target band",
  within: "in the target band",
  above: "above the target band",
};
const MAX_ROWS = 7;
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/**
 * "Hard sets this week": one row per muscle with a track, the dashed target band (default 10 to 20 sets) and the count.
 * Below the band the bar turns accent yellow; the status is also written for screen readers, never colour alone. Server-renderable.
 */
export function TodayHardSetsCard({ muscles }: { muscles: MuscleVolume[] }) {
  const shown = muscles.slice(0, MAX_ROWS);
  if (shown.length === 0) {
    return (
      <section className="today-panel today-empty" aria-label="This week's volume">
        <h2 className="type-display-s today-empty__title">No sets this week yet</h2>
        <p className="today-muted">Your weekly sets per muscle appear after your first workout of the week.</p>
        <Link href="/progress" className="today-link">
          See your progress
        </Link>
      </section>
    );
  }
  const band = shown[0]!.band;
  const max = Math.max(band.high * 1.25, ...shown.map((m) => m.fractionalSets), 1);
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <section className="today-panel today-sets" aria-labelledby="today-sets-title">
      <h2 id="today-sets-title" className="type-label today-label">
        Hard sets this week · target {band.low}–{band.high}
      </h2>
      <ul className="today-sets__list" data-testid="today-hard-sets">
        {shown.map((m) => (
          <li key={m.muscle} className="today-sets__row" data-status={m.status}>
            <span className="today-sets__name">{MUSCLE_LABEL[m.muscle]}</span>
            <span className="today-sets__track" aria-hidden="true">
              <span className="today-sets__band" style={{ left: pct(m.band.low), width: `calc(${pct(m.band.high)} - ${pct(m.band.low)})` }} />
              <span className="today-sets__fill" style={{ width: pct(m.fractionalSets) }} />
            </span>
            <span className="today-sets__count num">
              {fmt(m.fractionalSets)}
              <span className="sr-only"> sets, {STATUS_TEXT[m.status]}</span>
            </span>
          </li>
        ))}
      </ul>
      <Link href="/progress" className="today-link">
        All progress
      </Link>
    </section>
  );
}
