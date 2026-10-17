"use client";
import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { dismissTip, markTipSeen, useTipHidden } from "@/components/ui/tips";

export interface PageIntroProps {
  /** Stable per-page key for the "dismissed" memory, e.g. "today" or "workout-guide". */
  id: string;
  /** One or two plain sentences: what the page is for and what to do first. */
  children: ReactNode;
  className?: string;
}

/**
 * The same note for a loading skeleton: identical text and box, so the swap to the real page moves nothing, but inert and hidden from
 * assistive technology (the real note replaces it a moment later). It is real text in the first flush of the document, so the browser
 * paints the page's largest text, its Largest Contentful Paint, without waiting for the page's data. It hides for a dismissed tip.
 */
export function PageIntroPlaceholder({ id, children, className }: PageIntroProps) {
  const hidden = useTipHidden(id);
  if (hidden) return null;
  return (
    <div className={clsx("page-intro", className)} aria-hidden="true">
      <p className="page-intro__text">{children}</p>
      <span className="page-intro__dismiss page-intro__dismiss--static">Got it</span>
    </div>
  );
}

/**
 * A short note under a page header, shown on the first visit only: it stays for that visit, and "Got it" removes it at once.
 * Settings → Show tips brings every note back.
 */
export function PageIntro({ id, children, className }: PageIntroProps) {
  const hidden = useTipHidden(id);
  useEffect(() => {
    if (!hidden) markTipSeen(id);
  }, [hidden, id]);
  if (hidden) return null;
  return (
    <div role="note" className={clsx("page-intro", className)} data-tip={id}>
      <p className="page-intro__text">{children}</p>
      <button type="button" className="page-intro__dismiss" onClick={() => dismissTip(id)}>
        Got it
      </button>
    </div>
  );
}
