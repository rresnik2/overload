// Minimal sign-up page (Phase 0). Stream A owns (auth): verification email, onboarding hand-off, Google, passkeys.
import { Suspense } from "react";
import { CredentialsForm } from "@/components/auth/CredentialsForm";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <PageHeader title="Create account" />
      <HardCard>
        <Suspense>
          <CredentialsForm mode="sign-up" />
        </Suspense>
      </HardCard>
    </main>
  );
}
