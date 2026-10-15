// Progress overview: one card per progression series, this and last week's sets per muscle, the training calendar and DOTS.
import Link from "next/link";
import { CalendarHeatmap } from "@/components/charts/CalendarHeatmap";
import { WeeklySetsChart } from "@/components/charts/WeeklySetsChart";
import { formatDate } from "@/components/charts/format";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { BigThreeCard, SeriesCards } from "@/components/progress/OverviewSections";
import { requireUser } from "@/server/auth/session";
import { loadProgressOverview } from "@/server/queries/progress";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const ctx = await requireUser();
  const overview = await loadProgressOverview(ctx);
  const unit = overview.profile.unitPreference;
  const [thisWeek, lastWeek] = overview.weeks;

  return (
    <>
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
      {overview.cards.length === 0 ? (
        <EmptyState
          title="Nothing to chart yet"
          description="Finish a workout and your estimated 1RM, volume and weekly sets show up here."
          action={<Link href="/workout" className="ui-btn ui-btn--primary">Start a workout</Link>}
        />
      ) : (
        <>
          <section aria-labelledby="ov-lifts" className="progress-section">
            <SectionHeader id="ov-lifts" index={1} title="Your lifts" />
            <SeriesCards cards={overview.cards} unit={unit} />
            <BigThreeCard bigThree={overview.bigThree} unit={unit} />
          </section>

          <section aria-labelledby="ov-sets" className="progress-section">
            <SectionHeader id="ov-sets" index={2} title="Weekly sets" />
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
