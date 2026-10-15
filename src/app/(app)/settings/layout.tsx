// Settings frame: sub-navigation + the onboarding guard for every settings page. Stream B owns the shell around it.
import type { ReactNode } from "react";
import { SettingsNav } from "@/components/profile/SettingsNav";
import { PageHeader } from "@/components/primitives/PageHeader";
import { requireUser } from "@/server/auth/session";
import { redirectIfNotOnboarded } from "@/server/profile/guard";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  await redirectIfNotOnboarded(ctx);
  return (
    <div className="settings-layout">
      <PageHeader title="Settings" />
      <SettingsNav />
      {children}
    </div>
  );
}
