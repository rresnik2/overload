import Link from "next/link";
import { WeeklySetsChart } from "@/components/charts/WeeklySetsChart";
import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import type { UserCtx } from "@/server/auth/ctx";
import { requireUser } from "@/server/auth/session";
import { loadProgressOverview } from "@/server/queries/progress";

/**
 * Today-page card (Wave 3 mounts it): this week's hard sets per muscle against the landmark band (top 6 muscles).
 * Async Server Component; pass `ctx` when the page already has it, otherwise it calls requireUser().
 */
export async function WeekVolumeCard({ ctx }: { ctx?: UserCtx }) {
  const overview = await loadProgressOverview(ctx ?? (await requireUser()));
  const week = overview.weeks[0];
  if (!week || week.muscles.length === 0) {
    return (
      <EmptyState
        title="No sets this week yet"
        description="Your weekly sets per muscle appear after your first workout of the week."
        action={<Link href="/progress" className="ui-btn ui-btn--ink">See your progress</Link>}
      />
    );
  }
  return (
    <HardCard as="section" aria-label="This week's volume" className="week-volume-card">
      <WeeklySetsChart weekStart={week.weekStart} muscles={week.muscles} title="This week's sets" limit={6} />
      <Link href="/progress" className="link link-hover">All progress</Link>
    </HardCard>
  );
}
