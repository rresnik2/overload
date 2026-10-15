import { PageHeader } from "@/components/primitives/PageHeader";
import { TemplatesView } from "@/components/templates/TemplatesView";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <PageHeader title="Templates" meta={["Workouts", "Plan"]} description="Reusable workouts: exercises with target sets, reps and rest. Everything works offline." />
      <TemplatesView />
    </PrefsProvider>
  );
}
