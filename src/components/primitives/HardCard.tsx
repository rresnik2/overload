import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * The signature surface: paper, square corners, a 6px vermilion hard shadow.
 * Props are FROZEN (CONTRACTS.md). `interactive` adds the press state (moves translate(2px,2px), shadow shrinks to 4px);
 * for a card that is a link, wrap/compose it with <Link> and keep this as the visual shell.
 */
export interface HardCardProps extends HTMLAttributes<HTMLElement> {
  /** Element to render. Default "div". */
  as?: "div" | "section" | "article" | "aside";
  /** Adds hover/press affordance (use when the whole card is clickable). Default false. */
  interactive?: boolean;
  /** Inner padding. Default true. */
  padded?: boolean;
  children?: ReactNode;
}

export function HardCard({ as: Tag = "div", interactive = false, padded = true, className, children, ...rest }: HardCardProps) {
  return (
    <Tag
      className={clsx("hard-card", padded && "hard-card--padded", interactive && "hard-card--interactive", className)}
      {...rest}
    >
      {children}
    </Tag>
  );
}
