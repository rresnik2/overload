"use client";
import clsx from "clsx";
import { CircleAlert, CircleCheck, Info, Star, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { InfoHint } from "./InfoHint";

export type ToastKind = "info" | "success" | "pr" | "error";

export interface ToastInput {
  /** pr = personal record (plate-red star), success = sync results, error = failures (announced assertively, stays longer). */
  kind?: ToastKind;
  title: string;
  description?: ReactNode;
  /** One optional action ("Undo", "View"). */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss in ms. Default 5000 (3500 for records, 8000 for errors). 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

interface ToastApi {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const NOOP: ToastApi = { toast: () => -1, dismiss: () => {} };
const ToastContext = createContext<ToastApi | null>(null);

/** Fire toasts from any client component under <ToastProvider>. Outside a provider it is a harmless no-op. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

const ICONS = { info: Info, success: CircleCheck, pr: Star, error: CircleAlert } as const;
const MAX_VISIBLE = 3;

function ToastCard({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const kind = item.kind ?? "info";
  const Icon = ICONS[kind];
  const duration = item.duration ?? (kind === "error" ? 8000 : kind === "pr" ? 3500 : 5000);
  const id = item.id;
  // Stable across the provider's re-renders, so another toast arriving does not restart this one's timer.
  const onDismiss = useCallback(() => dismiss(id), [dismiss, id]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // How the last press arrived: a tap on a touch screen dismisses, a mouse click on the card's text does not.
  const pressedBy = useRef<string>("mouse");
  const disarm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const arm = useCallback(() => {
    disarm();
    if (duration > 0) timer.current = setTimeout(onDismiss, duration);
  }, [duration, onDismiss, disarm]);
  useEffect(() => {
    arm();
    return disarm;
  }, [arm, disarm]);

  return (
    // Errors are assertive (role=alert), the rest polite (role=status). A real mouse hovering the card, or focus inside it
    // (the keyboard), pauses the timer. Touch never does: a tap fires compatibility mouse events and a finger leaves no
    // hover behind, so a paused toast would sit over the controls beneath it. A tap on the card dismisses it instead.
    <div
      role={kind === "error" ? "alert" : "status"}
      className={clsx("toast", `toast--${kind}`)}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") disarm();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") arm();
      }}
      onPointerDown={(e) => {
        pressedBy.current = e.pointerType;
      }}
      onClick={(e) => {
        if (pressedBy.current === "mouse" || (e.target as Element).closest("button, a")) return;
        onDismiss();
      }}
      onFocus={disarm}
      onBlur={arm}
    >
      <Icon className="toast__icon" size={20} aria-hidden="true" fill={kind === "pr" ? "currentColor" : "none"} strokeWidth={kind === "pr" ? 0 : 2} />
      <div className="toast__text">
        <p className="toast__title">
          {item.title}
          {kind === "pr" ? <InfoHint term="personalRecord" /> : null}
        </p>
        {item.description ? <p className="toast__description">{item.description}</p> : null}
      </div>
      {item.action ? (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            item.action?.onClick();
            onDismiss();
          }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" className="toast__close" aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once in a layout. Renders the live region (aria-live) and the stack of toasts above the mobile dock. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);
  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setItems((cur) => [...cur, { ...input, id }].slice(-MAX_VISIBLE));
    return id;
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
