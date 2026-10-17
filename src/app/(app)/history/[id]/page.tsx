import { PageIntro } from "@/components/ui/PageIntro";
import { HistoryDetail, HistoryDetailHeader } from "@/components/workout/HistoryDetail";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Workout" };

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <HistoryDetailHeader id={id} />
      <PageIntro id="history-detail">Fix a mistake by editing any set; your records and charts update. Use Save as template to repeat this workout later.</PageIntro>
      <HistoryDetail id={id} />
    </PrefsProvider>
  );
}
