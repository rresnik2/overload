// Placeholder landing page. Stream B owns (marketing): replace freely (keep it a Server Component).
import Link from "next/link";
import { HardCard } from "@/components/primitives/HardCard";
import { PageHeader } from "@/components/primitives/PageHeader";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 p-6">
      <PageHeader title="Overload" meta={["Web app", "Live"]} description="Log your lifts. Watch weight and reps climb." />
      <HardCard>
        <p className="mb-4">Track progressive overload with forecasts and evidence-based insights.</p>
        <div className="flex gap-3">
          <Link className="btn btn-primary" href="/sign-up">
            Create account
          </Link>
          <Link className="btn btn-ghost" href="/sign-in">
            Sign in
          </Link>
        </div>
      </HardCard>
    </main>
  );
}
