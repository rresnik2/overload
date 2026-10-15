"use server";
// Server Actions for the online forms of stream A. Each one is wrapped in withUser(): the user comes from the session,
// never from the arguments, and the strict schemas reject an injected `userId`.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProfileRow } from "@/contracts/entities";
import { withUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/profile/delete-account";
import { completeOnboarding } from "@/server/profile/onboarding";
import { updateProfile } from "@/server/profile/profile";
import type { ActionResult } from "@/server/profile/result";

export const completeOnboardingAction = withUser(async (ctx, input: unknown): Promise<ActionResult> => {
  const result = await completeOnboarding(ctx, input);
  if (result.ok) redirect("/today");
  return result;
});

export const updateProfileAction = withUser(async (ctx, input: unknown): Promise<ActionResult<ProfileRow>> => updateProfile(ctx, input));

export const deleteAccountAction = withUser(async (ctx, input: unknown): Promise<ActionResult> => {
  const result = await deleteAccount(ctx, input);
  if (!result.ok) return result;
  const jar = await cookies();
  for (const { name } of jar.getAll()) if (name.includes("better-auth")) jar.delete(name);
  redirect("/sign-in?deleted=1");
});
