import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";
import { isGoogleConfigured } from "@/components/auth/google-enabled";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

// Read per request: whether Google is configured comes from the runtime environment.
export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="auth-page">
      <PageHeader title="Sign in" />
      <HardCard>
        <Suspense>
          <SignInForm googleEnabled={isGoogleConfigured()} />
        </Suspense>
      </HardCard>
    </main>
  );
}
