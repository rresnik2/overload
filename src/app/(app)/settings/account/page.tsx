import { DeleteAccountForm } from "@/components/profile/DeleteAccountForm";
import { HardCard } from "@/components/primitives/HardCard";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { requireSessionInfo } from "@/server/auth/session";
import { prisma } from "@/server/db";

export const metadata = { title: "Account settings" };

export default async function AccountSettingsPage() {
  const { ctx, user } = await requireSessionInfo();
  const credential = await prisma.account.findFirst({ where: { userId: ctx.id, providerId: "credential" }, select: { id: true } });
  return (
    <div className="settings-layout">
      <section className="settings-section">
        <SectionHeader title="Your data" index={1} />
        <HardCard>
          <div className="settings-form">
            <p>
              Signed in as <strong>{user.email}</strong>. Download everything Overload stores about you as a JSON file: profile, workouts, templates, measurements, personal records and insights.
            </p>
            <div>
              {/* A plain link: the route handler answers with Content-Disposition: attachment. */}
              <a className="btn btn-outline" href="/settings/account/export" download>
                Download my data (JSON)
              </a>
            </div>
          </div>
        </HardCard>
      </section>
      <section className="settings-section">
        <SectionHeader title="Delete account" index={2} />
        <HardCard className="settings-danger">
          <DeleteAccountForm needsPassword={Boolean(credential)} />
        </HardCard>
      </section>
    </div>
  );
}
