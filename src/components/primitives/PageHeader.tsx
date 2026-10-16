import clsx from "clsx";
import { Fragment, type ReactNode } from "react";

/**
 * Page title block. Props are FROZEN (CONTRACTS.md).
 * `meta` renders as a meta line with muted slashes: ["Free weight", "Barbell"] -> "Free weight / Barbell".
 */
export interface PageHeaderProps {
  title: string;
  /** Meta line parts, joined with a muted slash. */
  meta?: string[];
  description?: ReactNode;
  /** Right-aligned buttons/links. */
  actions?: ReactNode;
  /** Heading level. Default "h1". */
  as?: "h1" | "h2";
  className?: string;
}

export function PageHeader({ title, meta, description, actions, as: Tag = "h1", className }: PageHeaderProps) {
  return (
    <header className={clsx("page-header", className)}>
      <div>
        {meta && meta.length > 0 ? (
          <p className="meta-line">
            {meta.map((part, i) => (
              <Fragment key={`${part}-${i}`}>
                {i > 0 && (
                  <span className="meta-line__slash" aria-hidden="true">
                    /
                  </span>
                )}
                <span>{part}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
        <Tag className="page-header__title">{title}</Tag>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}
