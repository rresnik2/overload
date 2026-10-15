"use client";
import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Right under the title (one line). */
  description?: ReactNode;
  /** Sticky action row (buttons). */
  footer?: ReactNode;
  /** "auto" (default): bottom sheet below 768px, centered dialog above. "center": always a dialog (Modal). */
  placement?: "auto" | "center";
  children?: ReactNode;
  className?: string;
}

/**
 * Native <dialog> opened with showModal(): focus trap, Escape to close, inert background and the top layer come from the
 * browser. Backdrop click closes. Bottom sheet on mobile (respects the home-indicator safe area), dialog on desktop.
 * Open/closing states animate with CSS transitions (disabled for prefers-reduced-motion).
 */
export function Sheet({ open, onClose, title, description, footer, placement = "auto", children, className }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={clsx("sheet", placement === "center" && "sheet--center", className)}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet__panel">
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__header">
          <div>
            <h2 id={titleId} className="sheet__title">
              {title}
            </h2>
            {description ? <p className="sheet__description">{description}</p> : null}
          </div>
          <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="sheet__body">{children}</div>
        {footer ? <footer className="sheet__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

/** A Sheet that is always a centered dialog. */
export function Modal(props: Omit<SheetProps, "placement">) {
  return <Sheet {...props} placement="center" />;
}
