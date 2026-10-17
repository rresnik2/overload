"use client";
// The Next up card behind its own boundary: if a suggestion or its drawings cannot be built from what is on this device, Today
// still opens with a plain way to start, and says what went wrong in a details line (the message is what we need to fix it).
import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClass } from "@/components/ui/Button";
import { SafeBoundary } from "@/components/ui/SafeBoundary";
import { TodayStartCard } from "./TodayStartCard";

function StartFallback({ error }: { error: Error }) {
  return (
    <section className="today-panel today-next" aria-label="Start a workout">
      <p className="type-label today-label">Start</p>
      <h2 className="type-display-s today-next__title">Start a workout</h2>
      <Link href="/workout" className={`${buttonClass({ block: true })} type-display-s today-next__go`}>
        Go to the workout screen
      </Link>
      <details className="today-next__error">
        <summary>Next up could not load</summary>
        <code>{error.message || String(error)}</code>
      </details>
    </section>
  );
}

export function SafeStartCard(props: ComponentProps<typeof TodayStartCard>) {
  return (
    <SafeBoundary label="Next up" fallback={(error) => <StartFallback error={error} />}>
      <TodayStartCard {...props} />
    </SafeBoundary>
  );
}
