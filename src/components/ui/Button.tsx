import clsx from "clsx";
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "ink" | "ghost" | "danger";

interface ButtonBaseProps {
  /** primary = plate blue fill in display type, ink = high-contrast neutral fill, ghost = bordered secondary, danger = destructive. Default "primary". */
  variant?: ButtonVariant;
  /** Full-width block (e.g. a mobile form submit). Default false. */
  block?: boolean;
  /** Shows a spinner, sets aria-busy and blocks activation. The label stays so the width does not jump. */
  loading?: boolean;
  /** Decorative leading icon (aria-hidden). */
  icon?: ReactNode;
  children?: ReactNode;
}

export type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>;
export type ButtonLinkProps = ButtonBaseProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

/** Class list for anything that should look like a button (a <summary>, a custom element). 44px minimum height. */
export function buttonClass({ variant = "primary", block = false, loading = false }: Pick<ButtonBaseProps, "variant" | "block" | "loading"> = {}): string {
  return clsx("ui-btn", `ui-btn--${variant}`, block && "ui-btn--block", loading && "ui-btn--loading");
}

function Content({ icon, loading, children }: Pick<ButtonBaseProps, "icon" | "loading" | "children">) {
  return (
    <>
      {loading ? <span className="ui-btn__spinner" aria-hidden="true" /> : icon ? <span aria-hidden="true" className="ui-btn__icon">{icon}</span> : null}
      <span className="ui-btn__label">{children}</span>
    </>
  );
}

/** States: default, hover (brightens), active (drops 1px), focus-visible (outline), disabled, loading (disabled + aria-busy). */
export function Button({ variant = "primary", block, loading = false, icon, className, children, type = "button", disabled, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(buttonClass({ variant, block, loading }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content icon={icon} loading={loading}>
        {children}
      </Content>
    </button>
  );
}

/** A Next <Link> styled as a button (navigation, not an action). */
export function ButtonLink({ variant = "primary", block, loading = false, icon, className, children, href, ...rest }: ButtonLinkProps) {
  return (
    <Link href={href} className={clsx(buttonClass({ variant, block, loading }), className)} {...rest}>
      <Content icon={icon} loading={loading}>
        {children}
      </Content>
    </Link>
  );
}
