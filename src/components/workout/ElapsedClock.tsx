"use client";
import { memo } from "react";
import { useNow } from "./hooks";
import { formatClock } from "./labels";

export interface ElapsedClockProps {
  /** ISO time the workout started. */
  startedAt: string;
  className?: string;
  /** Text before and after the clock ("Started " ... " ago"). */
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  testId?: string;
  /** Epoch ms to show instead of a live clock (tests, screenshots). */
  now?: number;
}

/**
 * The elapsed time of a workout, as a leaf: the one-second tick lives here, so only this paragraph re-renders each second and the
 * workout screen around it stays still. `memo` keeps it from re-rendering when its parent does.
 */
export const ElapsedClock = memo(function ElapsedClock({ startedAt, className, prefix = "", suffix = "", ariaLabel, testId, now }: ElapsedClockProps) {
  const tick = useNow(1000, now === undefined);
  return (
    <p className={className} aria-label={ariaLabel} data-testid={testId}>
      {prefix}
      {formatClock((now ?? tick) - new Date(startedAt).getTime())}
      {suffix}
    </p>
  );
});
