import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <PageHeader title="Forgot password" description="Enter your email and we will send a link to choose a new one." />
      <HardCard>
        <ForgotPasswordForm />
      </HardCard>
    </main>
  );
}
