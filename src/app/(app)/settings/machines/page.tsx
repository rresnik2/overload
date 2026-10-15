import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { MachinesView } from "@/components/workout/MachinesView";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Machines" };

export default async function MachinesPage() {
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <PageIntro id="machines">
        A <Term id="machineProfile">machine profile</Term> names one machine at one gym. Add one for each machine you use so its weights are never mixed with another&rsquo;s.
      </PageIntro>
      <MachinesView />
    </PrefsProvider>
  );
}
