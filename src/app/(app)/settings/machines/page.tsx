import { MachinesView } from "@/components/workout/MachinesView";
import { PrefsProvider } from "@/components/workout/prefs";
import { loadWorkoutPrefs } from "@/components/workout/prefs.server";
import { requireUser } from "@/server/auth/session";

export const metadata = { title: "Machines" };

export default async function MachinesPage() {
  const prefs = await loadWorkoutPrefs(await requireUser());
  return (
    <PrefsProvider prefs={prefs}>
      <MachinesView />
    </PrefsProvider>
  );
}
