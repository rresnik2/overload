import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <main className="auth-page">
      <PageHeader title="New password" />
      <HardCard>
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </HardCard>
    </main>
  );
}
