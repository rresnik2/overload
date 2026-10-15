// /today: start (or resume) a workout, this week's volume, the bodyweight trend and the latest insight.
// Each card handles its own empty state, so a brand-new user sees four invitations rather than blank charts.
import { Suspense } from "react";
import { LatestInsightCard } from "@/components/insights/LatestInsightCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { BodyTrendCard } from "@/components/body/BodyTrendCard";
import { WeekVolumeCard } from "@/components/progress/WeekVolumeCard";
import { TodayStartCard } from "@/components/today/TodayStartCard";
import { requireSessionInfo } from "@/server/auth/session";
import { latestReport } from "@/server/insights/reports";
import { getProfileRow } from "@/server/profile/profile";

export const metadata = { title: "Today" };

const Loading = () => <div className="today-loading" role="status" aria-label="Loading" />;

async function InsightSlot({ ctx }: { ctx: Parameters<typeof latestReport>[0] }) {
  return <LatestInsightCard report={await latestReport(ctx)} />;
}

export default async function TodayPage() {
  const { ctx, user } = await requireSessionInfo();
  const profile = await getProfileRow(ctx);
  return (
    <>
      <PageHeader title="Today" meta={["Overload", user.name]} />
      <div className="today-grid">
        <div className="today-grid__start">
          <TodayStartCard unit={profile?.unitPreference ?? "KG"} />
        </div>
        <Suspense fallback={<Loading />}>
          <WeekVolumeCard ctx={ctx} />
        </Suspense>
        <Suspense fallback={<Loading />}>
          <BodyTrendCard ctx={ctx} />
        </Suspense>
        <div className="today-grid__insight">
          <Suspense fallback={<Loading />}>
            <InsightSlot ctx={ctx} />
          </Suspense>
        </div>
      </div>
    </>
  );
}
