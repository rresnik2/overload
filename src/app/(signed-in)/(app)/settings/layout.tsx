// Settings frame: sub-navigation + the onboarding guard for every settings page. Stream B owns the shell around it.
import type { ReactNode } from "react";
import { SettingsNav } from "@/components/profile/SettingsNav";
import { SignOutButton } from "@/components/profile/SignOutButton";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireUser } from "@/server/auth/session";
import { redirectIfNotOnboarded } from "@/server/profile/guard";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  await redirectIfNotOnboarded(ctx);
  return (
    <div className="settings-layout">
      <PageHeader title="Settings" />
      <PageIntro id="settings">Your goal, experience and units shape your targets, forecasts and insights. Tap the small i next to a setting to see what it does.</PageIntro>
      <SettingsNav />
      {children}
      <SignOutButton />
    </div>
  );
}
