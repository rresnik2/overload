import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Numbered section header: "01/Progress" in Instrument Serif italic with a 2px vermilion underline rule.
 * Props are FROZEN (CONTRACTS.md). `index` renders as a zero-padded number followed by a vermilion slash
 * (index={1} -> "01/"); a string is shown as given. The index and slash are decorative (aria-hidden).
 */
export interface SectionHeaderProps {
  title: string;
  /** 1 -> "01", 12 -> "12"; strings pass through. Omit for an unnumbered header. */
  index?: number | string;
  /** Heading level. Default "h2". */
  as?: "h1" | "h2" | "h3";
  /** Right-aligned slot (a "View all" link, a filter, ...). */
  actions?: ReactNode;
  id?: string;
  className?: string;
}

export function formatSectionIndex(index: number | string): string {
  return typeof index === "number" ? String(index).padStart(2, "0") : index;
}

export function SectionHeader({ title, index, as: Tag = "h2", actions, id, className }: SectionHeaderProps) {
  return (
    <header className={clsx("section-header", className)}>
      <Tag id={id} className="section-header__title">
        {index !== undefined && (
          <>
            <span className="section-header__index num" aria-hidden="true">
              {formatSectionIndex(index)}
            </span>
            <span className="section-header__slash" aria-hidden="true">
              /
            </span>
          </>
        )}
        {title}
      </Tag>
      {actions ? <div className="section-header__actions">{actions}</div> : null}
    </header>
  );
}
