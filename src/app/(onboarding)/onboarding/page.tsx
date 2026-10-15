import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/profile/OnboardingWizard";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";
import { requireSessionInfo } from "@/server/auth/session";
import { isOnboarded } from "@/server/profile/guard";

export const metadata = { title: "Set up" };

export default async function OnboardingPage() {
  const { ctx, user } = await requireSessionInfo();
  if (await isOnboarded(ctx)) redirect("/today");
  return (
    <main className="auth-page auth-page--wide">
      <PageHeader title="Set up Overload" meta={["Welcome", user.name]} description="A few questions so charts, forecasts and strength scores start out right." />
      <HardCard>
        <OnboardingWizard />
      </HardCard>
    </main>
  );
}
