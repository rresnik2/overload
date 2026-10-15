import { PageHeader } from "@/components/primitives/PageHeader";
import { HistoryDetail } from "@/components/workout/HistoryDetail";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Workout" };

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <PageHeader title="Workout" meta={["History"]} />
      <HistoryDetail id={id} />
    </PrefsProvider>
  );
}
