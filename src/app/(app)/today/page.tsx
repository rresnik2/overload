// /today: the Calibrated Dial home screen. Next up and templates (start a workout), the four main lifts' estimated 1RM with their
// 4-week change, the 12-week e1RM chart of the lift that most needs attention, this week's hard sets, the latest insight and the
// bodyweight trend. Each card handles its own empty state, so a brand-new user sees invitations rather than blank charts. The async
// data resolves in parallel and the page renders once: streaming cards in behind Suspense fallbacks moved the layout (CLS 0.3).
// Layout (src/styles/today.css): one column under 768 px, two columns to 1023 px, then 290 px / 1fr / 270 px.
import { E1rmChart } from "@/components/today/E1rmChart";
import { E1rmTiles } from "@/components/today/E1rmTiles";
import { TodayBodyCard } from "@/components/today/TodayBodyCard";
import { TodayHardSetsCard } from "@/components/today/TodayHardSetsCard";
import { TodayInsightCard } from "@/components/today/TodayInsightCard";
import { TodayStartCard } from "@/components/today/TodayStartCard";
import { TodayTemplatesCard } from "@/components/today/TodayTemplatesCard";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireSessionInfo } from "@/server/auth/session";
import { latestReport } from "@/server/insights/reports";
import { getProfileRow } from "@/server/profile/profile";
import { loadBodyView } from "@/server/queries/body";
import { loadProgressOverview, loadToday } from "@/server/queries/progress";
import { loadTodayLifts } from "@/server/queries/progress.today";

export const metadata = { title: "Today" };

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function TodayPage() {
  const { ctx } = await requireSessionInfo();
  const today = await loadToday(ctx);
  const [profile, report, lifts, overview, body] = await Promise.all([
    getProfileRow(ctx),
    latestReport(ctx),
    loadTodayLifts(ctx, { today }),
    loadProgressOverview(ctx, { today }),
    loadBodyView(ctx, { today }),
  ]);
  const unit = profile?.unitPreference ?? "KG";
  return (
    <div className="today">
      <header className="today-head">
        <p className="type-label today-label">{DATE_LABEL.format(new Date(`${today}T00:00:00Z`)).replace(",", "")}</p>
        <h1 className="type-display-xl today-title">Today</h1>
      </header>
      <PageIntro id="today">Start a workout here, then watch your estimated 1RMs, this week&rsquo;s sets and your bodyweight trend fill in. Your latest insight is on the page too.</PageIntro>
      <div className="today-grid">
        <div className="today-col today-col--a">
          <div className="today-cell today-cell--start">
            <TodayStartCard unit={unit} />
          </div>
          <div className="today-cell today-cell--templates">
            <TodayTemplatesCard unit={unit} />
          </div>
          <div className="today-cell today-cell--body">
            <TodayBodyCard view={body} />
          </div>
        </div>
        <div className="today-col today-col--b">
          <section className="today-cell today-cell--tiles" aria-labelledby="today-tiles-title">
            <h2 id="today-tiles-title" className="type-label today-label">
              Estimated 1RM · change over 4 weeks
            </h2>
            <E1rmTiles tiles={lifts.tiles} unit={lifts.unit} />
          </section>
          <div className="today-cell today-cell--chart">
            <E1rmChart chart={lifts.chart} unit={lifts.unit} />
          </div>
        </div>
        <div className="today-col today-col--c">
          <div className="today-cell today-cell--sets">
            <TodayHardSetsCard muscles={overview.weeks[0]?.muscles ?? []} />
          </div>
          <div className="today-cell today-cell--insight">
            <TodayInsightCard report={report} />
          </div>
        </div>
      </div>
    </div>
  );
}
