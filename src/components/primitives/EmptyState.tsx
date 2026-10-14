import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Empty / zero-data state. Props are FROZEN (CONTRACTS.md). Always give the user a next step via `action`
 * (and say WHY it is empty in `description`).
 */
export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  /** A decorative icon (rendered in vermilion). */
  icon?: ReactNode;
  /** The call to action (a Button/Link). */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <section className={clsx("empty-state", className)}>
      {icon ? (
        <div className="empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__description">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  );
}
