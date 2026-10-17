"use server";
// Server Actions for the online forms of stream A. Each one is wrapped in withUser(): the user comes from the session,
// never from the arguments, and the strict schemas reject an injected `userId`.
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProfileRow } from "@/contracts/entities";
import { withUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/profile/delete-account";
import { completeOnboarding } from "@/server/profile/onboarding";
import { updateProfile } from "@/server/profile/profile";
import type { ActionResult } from "@/server/profile/result";

// staleTimes.dynamic (next.config.ts) keeps visited pages in the client router cache for 30 s. Units, goal, timezone and the
// onboarded flag shape every signed-in page, so a successful write drops the whole cache (a Server Action's revalidatePath
// invalidates the client router cache and re-renders the open page).
function invalidateEverything(): void {
  revalidatePath("/", "layout");
}

export const completeOnboardingAction = withUser(async (ctx, input: unknown): Promise<ActionResult> => {
  const result = await completeOnboarding(ctx, input);
  if (result.ok) {
    invalidateEverything(); // a /today visited before onboarding is cached as a redirect to /onboarding
    redirect("/today");
  }
  return result;
});

export const updateProfileAction = withUser(async (ctx, input: unknown): Promise<ActionResult<ProfileRow>> => {
  const result = await updateProfile(ctx, input);
  if (result.ok) invalidateEverything();
  return result;
});

export const deleteAccountAction = withUser(async (ctx, input: unknown): Promise<ActionResult> => {
  const result = await deleteAccount(ctx, input);
  if (!result.ok) return result;
  invalidateEverything();
  const jar = await cookies();
  for (const { name } of jar.getAll()) if (name.includes("better-auth")) jar.delete(name);
  redirect("/sign-in?deleted=1");
});
