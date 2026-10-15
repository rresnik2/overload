"use client";
import clsx from "clsx";
import type { ReactNode } from "react";
import { dismissTip, useTipHidden } from "@/client/hints/tips";

export interface PageIntroProps {
  /** Stable per-page key for the "dismissed" memory, e.g. "today" or "workout-guide". */
  id: string;
  /** One or two plain sentences: what the page is for and what to do first. */
  children: ReactNode;
  className?: string;
}

/** A short note under a page header. Dismiss it once and it stays away on this device; Settings → Show tips brings it back. */
export function PageIntro({ id, children, className }: PageIntroProps) {
  const hidden = useTipHidden(id);
  if (hidden) return null;
  return (
    <aside className={clsx("page-intro", className)} aria-label="Tip" data-tip={id}>
      <p className="page-intro__text">{children}</p>
      <button type="button" className="page-intro__dismiss" onClick={() => dismissTip(id)}>
        Got it
      </button>
    </aside>
  );
}
