import { SignUpForm } from "@/components/auth/SignUpForm";
import { isGoogleConfigured } from "@/components/auth/google-enabled";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <main className="auth-page">
      <PageHeader title="Create account" description="Takes a minute. We will email you a link to confirm your address." />
      <HardCard>
        <SignUpForm googleEnabled={isGoogleConfigured()} />
      </HardCard>
    </main>
  );
}
