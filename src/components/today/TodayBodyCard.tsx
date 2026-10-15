import Link from "next/link";
import { formatDate, unitLabel, weightText } from "@/components/charts/format";
import { fromKg } from "@/lib/units";
import type { BodyData } from "@/server/queries/body";

/** "Bodyweight": the smoothed trend as a display number, its 4-week change, and the latest body fat. Server-renderable. */
export function TodayBodyCard({ view }: { view: BodyData }) {
  const u = unitLabel(view.unit);
  if (view.weight.points.length === 0 || view.weight.trendKg == null) {
    return (
      <section className="today-panel today-empty" aria-label="Bodyweight trend">
        <h2 className="type-display-s today-empty__title">No weigh-ins yet</h2>
        <p className="today-muted">Log your bodyweight to see its trend here.</p>
        <Link href="/progress/body" className="today-link">
          Log a weigh-in
        </Link>
      </section>
    );
  }
  const delta = view.weight.trend28dKg;
  const shown = delta == null ? null : Math.round(fromKg(Math.abs(delta), view.unit) * 10) / 10;
  return (
    <section className="today-panel today-body" aria-label="Bodyweight trend">
      <h2 className="type-label today-label">Bodyweight · trend</h2>
      <p className="today-body__line">
        <span className="type-display-m today-body__value num">{weightText(view.weight.trendKg, view.unit)}</span>{" "}
        <span className="today-muted num">
          {u}
          {shown == null || delta == null
            ? ` · latest ${weightText(view.weight.latestKg ?? view.weight.trendKg, view.unit)}`
            : ` · ${delta > 0 ? "+" : delta < 0 ? "−" : ""}${shown.toFixed(1)} over 4 weeks`}
        </span>
      </p>
      {view.bodyFat.resolved ? (
        <p className="today-muted num">
          Body fat {view.bodyFat.resolved.pct.toFixed(1)}% · {formatDate(view.bodyFat.resolved.localDate, true)}
        </p>
      ) : null}
      <Link href="/progress/body" className="today-link">
        Body metrics
      </Link>
    </section>
  );
}
