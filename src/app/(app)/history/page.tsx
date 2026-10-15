import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { HistoryList } from "@/components/workout/HistoryList";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "History" };

export default async function HistoryPage() {
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <PageHeader title="History" meta={["Workouts", "Log"]} description="Every workout by the day you did it. Edit or delete sets here; changes sync when you have signal." />
      <PageIntro id="history">
        Tap a workout to fix a set or save it as a template. Each card shows its <Term id="volumeLoad">volume</Term>: weight times reps, added up.
      </PageIntro>
      <HistoryList />
    </PrefsProvider>
  );
}
