// Landing point after sign-in, email verification and Google: sends new users to onboarding, everyone else on to `next`.
import { redirect } from "next/navigation";
import { safeNext } from "@/client/auth/safe-next";
import { getSessionInfo } from "@/server/auth/session";
import { redirectIfNotOnboarded } from "@/server/profile/guard";

export const metadata = { title: "Signing in" };

export default async function ContinuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const info = await getSessionInfo();
  if (!info) redirect(first(params.error) ? `/verify-email?error=${encodeURIComponent(first(params.error) ?? "")}` : "/sign-in");
  await redirectIfNotOnboarded(info.ctx);
  redirect(safeNext(first(params.next)));
}
