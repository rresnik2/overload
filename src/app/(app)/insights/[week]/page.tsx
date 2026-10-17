// /insights/<weekStart>: one stored report, read-only.
import Link from "next/link";
import { notFound } from "next/navigation";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { weekRangeLabel } from "@/components/insights/labels";
import { ReportView } from "@/components/insights/ReportView";
import { PageHeader } from "@/components/primitives/PageHeader";
import { isValidLocalDate } from "@/lib/dates";
import { requireUser } from "@/server/auth/session";
import { prismaReportStore } from "@/server/insights/reports";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Insight" };

export default async function InsightWeekPage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  if (!isValidLocalDate(week)) notFound();
  const ctx = await requireUser();
  const syncVersion = await pageSyncVersion(ctx);
  const stored = await prismaReportStore.find(ctx, week);
  if (!stored?.row) notFound();
  return (
    <>
      <SyncVersionStamp version={syncVersion} />
      <PageHeader title="Weekly review" meta={[weekRangeLabel(week)]} actions={<Link href="/insights" className="link-underline">All insights</Link>} />
      <ReportView facts={stored.row.facts} report={stored.row} />
    </>
  );
}
