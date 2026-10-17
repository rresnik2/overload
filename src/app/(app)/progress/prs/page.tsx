// Personal records per series. Machine series are separate boards; nothing here is converted between machines and barbells.
import Link from "next/link";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { PrBoardView } from "@/components/progress/PrBoardView";
import { requireUser } from "@/server/auth/session";
import { loadPrBoard } from "@/server/queries/prs";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Records" };

export default async function PrsPage() {
  const ctx = await requireUser();
  const syncVersion = await pageSyncVersion(ctx); // before the first synced row is read (src/server/sync/page-version.ts)
  const board = await loadPrBoard(ctx);
  return (
    <>
      <SyncVersionStamp version={syncVersion} />
      <PageHeader
        title="Records"
        meta={["Progress", `${board.series.length} series`]}
        description="Your best lifts per exercise and machine."
        actions={<Link href="/progress" className="btn btn-outline">All progress</Link>}
      />
      <PageIntro id="progress-prs">
        A <Term id="personalRecord">personal record</Term> is your best ever in a category. Machines and free weights have separate records.
      </PageIntro>
      {board.series.length === 0 ? (
        <EmptyState title="No records yet" description="Complete a working set and your first records appear here." action={<Link href="/workout" className="ui-btn ui-btn--primary">Start a workout</Link>} />
      ) : (
        <PrBoardView board={board} unit={board.unit} />
      )}
    </>
  );
}
