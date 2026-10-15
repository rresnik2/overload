"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { regenerateInsightAction, type RegenerateResult } from "@/server/actions/insights";

const MESSAGES: Record<RegenerateResult["status"], string> = {
  generated: "Review updated.",
  cached: "Nothing has changed since the last review, so it was not regenerated and no regeneration was used.",
  empty: "No completed sets this week yet.",
  failed: "The written review could not be generated. Try again in a moment.",
  rate_limited: "You have used all regenerations for this week. A new review is written every week automatically.",
  in_progress: "A review is already being written. Check back in a minute.",
};

export function RegenerateButton({ remaining, max, label = "Regenerate review" }: { remaining: number; max: number; label?: string }) {
  const [left, setLeft] = useState(remaining);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await regenerateInsightAction();
        setLeft(result.remaining);
        setMessage(MESSAGES[result.status]);
      } catch {
        setMessage("Could not reach the server. Check your connection and try again.");
      }
    });

  return (
    <div className="regenerate">
      <Button onClick={run} loading={pending} disabled={left <= 0} variant="ink">
        {label}
      </Button>
      <p className="regenerate__left num" data-testid="regenerations-left">
        {left} of {max} regenerations left this week
      </p>
      <p className="regenerate__message" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
