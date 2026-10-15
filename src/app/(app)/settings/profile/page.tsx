import { ProfileForm } from "@/components/profile/ProfileForm";
import { HardCard } from "@/components/primitives/HardCard";
import { SectionHeader } from "@/components/primitives/SectionHeader";
import { requireUser } from "@/server/auth/session";
import { getProfileRow } from "@/server/profile/profile";
import { redirect } from "next/navigation";

export const metadata = { title: "Profile settings" };

export default async function ProfileSettingsPage() {
  const ctx = await requireUser();
  const profile = await getProfileRow(ctx);
  if (!profile) redirect("/onboarding");
  return (
    <section className="settings-section">
      <SectionHeader title="Profile" index={1} />
      <HardCard>
        <ProfileForm initial={profile} />
      </HardCard>
    </section>
  );
}
