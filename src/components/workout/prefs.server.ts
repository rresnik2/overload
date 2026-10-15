import "server-only";
// Server side of the logging preferences: the signed-in user's profile mapped to WorkoutPrefs (null when there is no profile yet).
import type { UserCtx } from "@/server/auth/ctx";
import { getProfileRow } from "@/server/profile/profile";
import type { WorkoutPrefs } from "./prefs";

export async function loadWorkoutPrefs(ctx: UserCtx): Promise<WorkoutPrefs | null> {
  const profile = await getProfileRow(ctx);
  if (!profile) return null;
  return { unit: profile.unitPreference, effortScale: profile.effortScale, defaultRestSec: profile.defaultRestSec, e1rmFormula: profile.e1rmFormula };
}
