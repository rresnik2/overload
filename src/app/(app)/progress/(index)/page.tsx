// Progress overview: one card per progression series, this and last week's sets per muscle, the training calendar and DOTS.
import Link from "next/link";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import { WeeklySetsChart } from "@/components/charts/WeeklySetsChart";
import { formatDate } from "@/components/charts/format";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { InfoHint } from "@/components/ui/InfoHint";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { BigThreeCard, SeriesCards } from "@/components/progress/OverviewSections";
import { requireUser } from "@/server/auth/session";
import { loadProgressOverview, loadToday } from "@/server/queries/progress";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const ctx = await requireUser();
  // The sync version is read beside the profile, before any synced row is (src/server/sync/page-version.ts).
  const [today, syncVersion] = await Promise.all([loadToday(ctx), pageSyncVersion(ctx)]);
  const overview = await loadProgressOverview(ctx, { today });
  const unit = overview.profile.unitPreference;
  const [thisWeek, lastWeek] = overview.weeks;

  return (
    <>
      <SyncVersionStamp version={syncVersion} />
      <PageHeader
        title="Progress"
        meta={["Last 16 weeks", `${overview.cards.length} series`]}
        description="Strength, volume and body trends. Machines at different gyms are tracked as separate series and never merged."
        actions={
          <>
            <Link href="/progress/prs" className="btn btn-outline">Records</Link>
            <Link href="/progress/body" className="btn btn-outline">Body</Link>
          </>
        }
      />
      <PageIntro id="progress">
        Each card is one exercise (or one machine). Open it to see your <Term id="e1rm">estimated max</Term> over time. Weekly sets show how much work each muscle got.
      </PageIntro>
      {overview.cards.length === 0 ? (
        <EmptyState
          title="Nothing to chart yet"
          description="Finish a workout and your estimated 1RM, volume and weekly sets show up here."
          action={<Link href="/workout" className="ui-btn ui-btn--primary">Start a workout</Link>}
        />
      ) : (
        <>
          <section aria-labelledby="ov-lifts" className="progress-section">
            <SectionHeader id="ov-lifts" index={1} title="Your lifts" actions={<InfoHint term="progressSeries" />} />
            <SeriesCards cards={overview.cards} unit={unit} />
            <BigThreeCard bigThree={overview.bigThree} unit={unit} />
          </section>

          <section aria-labelledby="ov-sets" className="progress-section">
            <SectionHeader id="ov-sets" index={2} title="Weekly sets" actions={<><InfoHint term="weeklySets" /><InfoHint term="targetBand" /></>} />
            {thisWeek ? <WeeklySetsChart weekStart={thisWeek.weekStart} muscles={thisWeek.muscles} title={`This week (from ${formatDate(thisWeek.weekStart)})`} /> : null}
            {lastWeek ? <WeeklySetsChart weekStart={lastWeek.weekStart} muscles={lastWeek.muscles} title={`Last week (from ${formatDate(lastWeek.weekStart)})`} /> : null}
          </section>

          <section aria-labelledby="ov-cal" className="progress-section">
            <SectionHeader id="ov-cal" index={3} title="Consistency" />
            <CalendarHeatmap heatmap={overview.heatmap} />
          </section>
        </>
      )}
    </>
  );
}
