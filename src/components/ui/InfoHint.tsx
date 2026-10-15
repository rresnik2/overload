"use client";
import clsx from "clsx";
import { Info } from "lucide-react";
import { GLOSSARY, type TermId } from "@/lib/glossary";
import { useHint } from "./useHint";

export interface InfoHintProps {
  /** A glossary id: the text of every hint lives in src/lib/glossary.ts. */
  term: TermId;
  className?: string;
}

/**
 * A small "i" next to a label. The visible circle is 18px; the button is 44px so a thumb can hit it (its negative
 * margin keeps the layout footprint small). Hover or keyboard focus shows the explanation on devices with a mouse; a
 * tap shows it on touch screens. Tap again, tap outside or press Escape to close.
 * Never put one inside a <label> or a link: a click would also activate that control.
 */
export function InfoHint({ term, className }: InfoHintProps) {
  const hint = useHint(term);
  return (
    <span className={clsx("info-hint", className)} {...hint.wrapperProps}>
      <button {...hint.triggerProps} className="info-hint__btn" aria-label={`What is ${GLOSSARY[term].term}?`}>
        <Info className="info-hint__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {hint.popover}
    </span>
  );
}
