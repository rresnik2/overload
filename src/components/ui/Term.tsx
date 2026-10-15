"use client";
import clsx from "clsx";
import type { ReactNode } from "react";
import type { TermId } from "@/lib/glossary";
import { useHint } from "./useHint";

export interface TermProps {
  id: TermId;
  children: ReactNode;
  className?: string;
}

/** Jargon inside a sentence, a table header or a chart title: dotted underline, the same popover as InfoHint. */
export function Term({ id, children, className }: TermProps) {
  const hint = useHint(id);
  return (
    <span className={clsx("term", className)} {...hint.wrapperProps}>
      <button {...hint.triggerProps} className="term__btn">
        {children}
      </button>
      {hint.popover}
    </span>
  );
}
