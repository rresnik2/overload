// Minimal sign-in page (Phase 0). Stream A owns (auth): full flows, Google, passkeys, reset.
import { Suspense } from "react";
import { CredentialsForm } from "@/components/auth/CredentialsForm";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <PageHeader title="Sign in" />
      <HardCard>
        <Suspense>
          <CredentialsForm mode="sign-in" />
        </Suspense>
      </HardCard>
    </main>
  );
}
