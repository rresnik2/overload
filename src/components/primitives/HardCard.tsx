import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * The base surface: a base-200 panel with a 1px hairline border and the theme's small radius, no shadow.
 * Props are FROZEN (CONTRACTS.md). `interactive` adds the press state (the border firms up on hover, the card drops 1px);
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
