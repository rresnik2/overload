// Offline fallback page (precached by the service worker). Stream B owns it.
import Link from "next/link";
import { EmptyState } from "@/components/primitives/EmptyState";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl items-center p-6">
      <EmptyState
        title="You're offline"
        description="This page isn't saved on your phone yet. Your workout logging keeps working offline and will sync when you're back online."
        action={
          <Link className="btn btn-primary" href="/workout">
            Open workout
          </Link>
        }
      />
    </main>
  );
}
