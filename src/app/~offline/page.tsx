// Offline fallback page (precached by the service worker). Stream B owns it. Static: no JS, no auth.
import { EmptyState } from "@/components/primitives/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl items-center p-6">
      <h1 className="sr-only">Offline</h1>
      <EmptyState
        title="You're offline"
        description="This page isn't saved on your phone yet. Workout logging keeps working offline and syncs when you're back online."
        action={<ButtonLink href="/workout">Open workout</ButtonLink>}
      />
    </main>
  );
}
