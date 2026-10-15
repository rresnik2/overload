import Link from "next/link";
import { formatDate, unitLabel, weightText } from "@/components/charts/format";
import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import { Stat } from "@/components/ui/Stat";
import { fromKg } from "@/lib/units";
import type { UserCtx } from "@/server/auth/ctx";
import { requireUser } from "@/server/auth/session";
import { loadBodyView } from "@/server/queries/body";

/**
 * Today-page card (Wave 3 mounts it): the bodyweight trend and the latest body fat. Async Server Component; pass `ctx` when the
 * page already has it, otherwise it calls requireUser(). Handles the no-data case with an EmptyState.
 */
export async function BodyTrendCard({ ctx }: { ctx?: UserCtx }) {
  const view = await loadBodyView(ctx ?? (await requireUser()));
  const u = unitLabel(view.unit);
  if (view.weight.points.length === 0) {
    return (
      <EmptyState
        title="No weigh-ins yet"
        description="Log your bodyweight to see its trend here."
        action={<Link href="/progress/body" className="ui-btn ui-btn--primary">Log a weigh-in</Link>}
      />
    );
  }
  const delta = view.weight.trend28dKg;
  return (
    <HardCard as="section" aria-label="Bodyweight trend" className="body-trend-card">
      <div className="progress-stats">
        <Stat
          label="Bodyweight trend"
          value={weightText(view.weight.trendKg!, view.unit)}
          unit={u}
          note={delta != null ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(fromKg(delta, view.unit)).toFixed(1)} ${u} over 4 weeks` : `latest ${weightText(view.weight.latestKg!, view.unit)} ${u}`}
        />
        {view.bodyFat.resolved ? <Stat label="Body fat" value={view.bodyFat.resolved.pct.toFixed(1)} unit="%" note={formatDate(view.bodyFat.resolved.localDate, true)} /> : null}
      </div>
      <Link href="/progress/body" className="link link-hover">Body metrics</Link>
    </HardCard>
  );
}
