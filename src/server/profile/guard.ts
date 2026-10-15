import "server-only";
// Wave 3 mounts this in the (app) layout; stream A calls it from its own pages and the sign-in success path.
import { redirect } from "next/navigation";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";

/** Sends users who have not finished onboarding to /onboarding. Resolves (does nothing) for onboarded users. */
export async function redirectIfNotOnboarded(ctx: UserCtx): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { userId: ctx.id }, select: { onboardedAt: true } });
  if (!profile?.onboardedAt) redirect("/onboarding");
}

export async function isOnboarded(ctx: UserCtx): Promise<boolean> {
  const profile = await prisma.profile.findUnique({ where: { userId: ctx.id }, select: { onboardedAt: true } });
  return Boolean(profile?.onboardedAt);
}
