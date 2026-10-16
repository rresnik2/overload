"use client";
import { setHapticsEnabled, useHapticsEnabled } from "@/components/workout/haptics";

/** Settings > Haptics: a light tick on every dial click and button tap, and a firmer pulse when a set is logged. Per device. */
export function HapticsToggle() {
  const enabled = useHapticsEnabled();
  return (
    <label className="flex min-h-[var(--tap-target)] items-center gap-3">
      <input type="checkbox" className="checkbox" checked={enabled} onChange={(e) => setHapticsEnabled(e.target.checked)} />
      <span>Haptics: a small tick as the weight dial turns and when you log a set (on phones that support it)</span>
    </label>
  );
}
