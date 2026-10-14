// Stub app page. Wave 3 (integration) builds /today from the cards the other streams export
// (StartWorkoutCard, WeekVolumeCard, BodyTrendCard, LatestInsightCard).
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/primitives/PageHeader";
import { requireSessionInfo } from "@/server/auth/session";

export const metadata = { title: "Today" };

export default async function TodayPage() {
  const { user } = await requireSessionInfo();
  return (
    <>
      <PageHeader title="Today" meta={["Overload", user.name]} />
      <EmptyState title="Nothing logged yet" description="Your workouts, progress and insights will show up here." />
    </>
  );
}
