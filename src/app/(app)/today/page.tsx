// /today: the Calibrated Dial home screen. Next up and templates (start a workout), the four main lifts' estimated 1RM with their
// 4-week change, the 12-week e1RM chart of the lift that most needs attention, this week's hard sets, the latest insight and the
// bodyweight trend. Each card handles its own empty state, so a brand-new user sees invitations rather than blank charts. The async
// data resolves in parallel and the page renders once: streaming cards in behind Suspense fallbacks moved the layout (CLS 0.3).
// Layout (src/styles/today.css): one column under 768 px, two columns to 1023 px, then 290 px / 1fr / 270 px.
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { E1rmChart } from "@/components/today/E1rmChart";
import { TODAY_INTRO } from "@/components/today/intro";
import { E1rmTiles } from "@/components/today/E1rmTiles";
import { TodayBodyCard } from "@/components/today/TodayBodyCard";
import { TodayHardSetsCard } from "@/components/today/TodayHardSetsCard";
import { TodayInsightCard } from "@/components/today/TodayInsightCard";
import { SafeStartCard } from "@/components/today/SafeStartCard";
import { TodayTemplatesCard } from "@/components/today/TodayTemplatesCard";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireSessionInfo } from "@/server/auth/session";
import { listExercisesWithLoads } from "@/server/catalog/last-loads";
import { loadInsightsOverview } from "@/server/insights/current";
import { latestReport } from "@/server/insights/reports";
import { getProfileRow } from "@/server/profile/profile";
import { loadBodyView } from "@/server/queries/body";
import { loadProgressOverview, loadToday } from "@/server/queries/progress";
import { loadTodayLifts } from "@/server/queries/progress.today";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Today" };

const DATE_LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export default async function TodayPage() {
  const { ctx } = await requireSessionInfo();
  // The profile row is read once per request (src/server/profile/row.ts): the layout's onboarding guard, loadToday and getProfileRow
  // share it. The insight lookup does not need the date, so it runs beside it; the three data loaders need `today` and run together.
  // The sync version is read beside the profile (neither touches synced rows) and so before the three loaders start: that ordering
  // is what lets the client skip a refresh when a sync only brings what this page already shows (src/server/sync/page-version.ts).
  const reportPromise = latestReport(ctx);
  const [today, profile, syncVersion] = await Promise.all([loadToday(ctx), getProfileRow(ctx), pageSyncVersion(ctx)]);
  const [report, lifts, overview, body] = await Promise.all([
    reportPromise,
    loadTodayLifts(ctx, { today }),
    loadProgressOverview(ctx, { today }),
    loadBodyView(ctx, { today }),
  ]);
  // No written report yet: the rule-based findings /insights shows for the review week still have something to say. Beside it, each
  // lift tile's exercise and last top set, drawn loaded on the tile.
  const tileExerciseIds = lifts.tiles.flatMap((t) => (t.seriesKey ? [t.seriesKey.split(":")[0]!] : []));
  const [overviewForPreview, tileLoads] = await Promise.all([report ? null : loadInsightsOverview(ctx), listExercisesWithLoads(ctx, tileExerciseIds)]);
  const preview = overviewForPreview?.preview ?? null;
  const unit = profile?.unitPreference ?? "KG";
  return (
    <div className="today">
      <SyncVersionStamp version={syncVersion} />
      <header className="today-head">
        <p className="type-label today-label">{DATE_LABEL.format(new Date(`${today}T00:00:00Z`)).replace(",", "")}</p>
        <h1 className="type-display-xl today-title">Today</h1>
      </header>
      <PageIntro id="today">{TODAY_INTRO}</PageIntro>
      <div className="today-grid">
        <div className="today-col today-col--a">
          <div className="today-cell today-cell--start">
            <SafeStartCard unit={unit} expectSuggestion={lifts.tiles.some((t) => t.e1rmKg != null)} />
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
            <E1rmTiles tiles={lifts.tiles} unit={lifts.unit} loads={tileLoads} />
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
            <TodayInsightCard report={report} preview={preview} />
          </div>
        </div>
      </div>
    </div>
  );
}
