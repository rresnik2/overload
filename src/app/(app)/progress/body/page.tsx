// Body: weight trend, body fat (with its method), FFMI as a range, circumferences and the logging form with the Navy calculator.
import Link from "next/link";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { BodyLog } from "@/components/body/BodyLog";
import { BodySections } from "@/components/body/BodySections";
import { PageHeader } from "@/components/primitives/PageHeader";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { requireUser } from "@/server/auth/session";
import { loadBodyView } from "@/server/queries/body";
import { loadToday } from "@/server/queries/progress";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Body" };

export default async function BodyPage() {
  const ctx = await requireUser();
  // The sync version is read beside the profile, before any synced row is (src/server/sync/page-version.ts).
  const [today, syncVersion] = await Promise.all([loadToday(ctx), pageSyncVersion(ctx)]);
  const view = await loadBodyView(ctx, { today });
  return (
    <>
      <SyncVersionStamp version={syncVersion} />
      <PageHeader
        title="Body"
        meta={["Progress", "Last 12 months"]}
        description="Weight trend, body fat, lean mass and tape measurements."
        actions={<Link href="/progress" className="btn btn-outline">All progress</Link>}
      />
      <PageIntro id="progress-body">
        Log your weight often: the <Term id="bodyweightTrend">trend</Term> smooths out daily swings. Body fat and tape measurements are optional.
      </PageIntro>
      <BodySections view={view} unit={view.unit} />
      <section aria-labelledby="body-log" className="progress-section">
        <SectionHeader id="body-log" index={5} title="Log a measurement" />
        <BodyLog today={view.today} unit={view.unit} sex={view.sex} heightCm={view.heightCm} entries={view.entries} />
      </section>
    </>
  );
}
