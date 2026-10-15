// /today: start (or resume) a workout, this week's volume, the bodyweight trend and the latest insight.
// Each card handles its own empty state, so a brand-new user sees four invitations rather than blank charts. The async cards resolve in
// parallel and the page renders once: streaming them in behind Suspense fallbacks moved the layout (CLS 0.3) when they arrived.
import { BodyTrendCard } from "@/components/body/BodyTrendCard";
import { LatestInsightCard } from "@/components/insights/LatestInsightCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { WeekVolumeCard } from "@/components/progress/WeekVolumeCard";
import { TodayStartCard } from "@/components/today/TodayStartCard";
import { TodayTemplatesCard } from "@/components/today/TodayTemplatesCard";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireSessionInfo } from "@/server/auth/session";
import { latestReport } from "@/server/insights/reports";
import { getProfileRow } from "@/server/profile/profile";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const { ctx, user } = await requireSessionInfo();
  const [profile, report] = await Promise.all([getProfileRow(ctx), latestReport(ctx)]);
  return (
    <>
      <PageHeader title="Today" meta={["Overload", user.name]} />
      <PageIntro id="today">Start a workout here, then watch this week&rsquo;s sets and your bodyweight trend fill in. Your latest insight appears at the bottom.</PageIntro>
      <div className="today-grid">
        <div className="today-grid__start">
          <TodayStartCard unit={profile?.unitPreference ?? "KG"} />
        </div>
        <div className="today-grid__start">
          <TodayTemplatesCard unit={profile?.unitPreference ?? "KG"} />
        </div>
        <WeekVolumeCard ctx={ctx} />
        <BodyTrendCard ctx={ctx} />
        <div className="today-grid__insight">
          <LatestInsightCard report={report} />
        </div>
      </div>
    </>
  );
}
