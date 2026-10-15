"use client";
import { setTipsEnabled, useTipsEnabled } from "@/components/ui/tips";

/** Settings > Show tips: brings back every dismissed page tip and the "How logging works" panel, or hides them all. */
export function ShowTipsToggle() {
  const enabled = useTipsEnabled();
  return (
    <label className="flex min-h-[var(--tap-target)] items-center gap-3">
      <input type="checkbox" className="checkbox" checked={enabled} onChange={(e) => setTipsEnabled(e.target.checked)} />
      <span>Show tips: short notes at the top of each page and on the workout screen</span>
    </label>
  );
}
