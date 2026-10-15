import { VerifyEmailPanel } from "@/components/auth/VerifyEmailPanel";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export const metadata = { title: "Check your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return (
    <main className="auth-page">
      <PageHeader title="Check your email" />
      <HardCard>
        <VerifyEmailPanel email={first(params.email) ?? null} sent={first(params.sent) === "1"} linkProblem={Boolean(first(params.error))} />
      </HardCard>
    </main>
  );
}
