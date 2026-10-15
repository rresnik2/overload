import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
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
      <PageIntro id="templates">
        A <Term id="template">template</Term> is a saved workout plan. Tap Start to log it, Edit to change its exercises, sets and reps, or Duplicate to make a variation.
      </PageIntro>
      <TemplatesView />
    </PrefsProvider>
  );
}
