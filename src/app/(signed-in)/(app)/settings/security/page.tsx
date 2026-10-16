import { ConnectedAccountsSection } from "@/components/profile/ConnectedAccountsSection";
import { PasskeySection } from "@/components/profile/PasskeySection";
import { PasswordSection } from "@/components/profile/PasswordSection";
import { SessionsSection } from "@/components/profile/SessionsSection";
import { isGoogleConfigured } from "@/components/auth/google-enabled";
import { HardCard } from "@/components/primitives/HardCard";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { auth } from "@/server/auth/auth";
import { requireSessionInfo } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { headers } from "next/headers";

export const metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { ctx, user } = await requireSessionInfo();
  const [credential, session] = await Promise.all([
    prisma.account.findFirst({ where: { userId: ctx.id, providerId: "credential" }, select: { id: true } }),
    auth.api.getSession({ headers: await headers() }),
  ]);
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <SectionHeader title="Password" index={1} />
        <HardCard>
          <PasswordSection hasPassword={Boolean(credential)} email={user.email} />
        </HardCard>
      </section>
      <section className="settings-section">
        <SectionHeader title="Passkeys" index={2} />
        <HardCard>
          <PasskeySection />
        </HardCard>
      </section>
      <section className="settings-section">
        <SectionHeader title="Connected accounts" index={3} />
        <HardCard>
          <ConnectedAccountsSection googleEnabled={isGoogleConfigured()} />
        </HardCard>
      </section>
      <section className="settings-section">
        <SectionHeader title="Active sessions" index={4} />
        <HardCard>
          <SessionsSection currentSessionId={session?.session.id ?? ""} />
        </HardCard>
      </section>
    </div>
  );
}
