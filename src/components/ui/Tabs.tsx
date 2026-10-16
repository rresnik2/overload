"use client";
import clsx from "clsx";
import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Modality } from "@/contracts/enums";

export interface TabItem {
  id: string;
  label: ReactNode;
  /** Content for this tab; omit when the parent renders content itself from `value`. */
  panel?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  /** Controlled selection. */
  value?: string;
  /** Uncontrolled initial selection (defaults to the first enabled tab). */
  defaultValue?: string;
  onChange?: (id: string) => void;
  /** Accessible name for the tablist. */
  label: string;
  className?: string;
}

/**
 * WAI-ARIA tabs: roving tabindex, ArrowLeft/Right + Home/End, plate-blue bar under the selected tab (selected, focus,
 * disabled states). Tabs without a `panel` still get role=tab; the parent owns the content.
 */
export function Tabs({ items, value, defaultValue, onChange, label, className }: TabsProps) {
  const base = useId();
  const [inner, setInner] = useState(defaultValue ?? items.find((t) => !t.disabled)?.id ?? "");
  const selected = value ?? inner;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
    refs.current[id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((t) => !t.disabled);
    const i = enabled.findIndex((t) => t.id === selected);
    let next: TabItem | undefined;
    if (e.key === "ArrowRight") next = enabled[(i + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(i - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (!next) return;
    e.preventDefault();
    select(next.id);
  };

  const active = items.find((t) => t.id === selected);
  return (
    <div className={clsx("tabs-o", className)}>
      <div role="tablist" aria-label={label} className="tabs-o__list" onKeyDown={onKeyDown}>
        {items.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === selected}
            aria-controls={t.panel !== undefined ? `${base}-panel-${t.id}` : undefined}
            tabIndex={t.id === selected ? 0 : -1}
            disabled={t.disabled}
            className="tabs-o__tab"
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active?.panel !== undefined ? (
        <div role="tabpanel" id={`${base}-panel-${active.id}`} aria-labelledby={`${base}-tab-${active.id}`} tabIndex={0} className="tabs-o__panel">
          {active.panel}
        </div>
      ) : null}
    </div>
  );
}

const MODALITY_TABS = [
  { id: Modality.FREE_WEIGHT, label: "Free weight", swatch: "var(--chart-free-weight)" },
  { id: Modality.MACHINE, label: "Machine", swatch: "var(--chart-machine)" },
  { id: Modality.CABLE, label: "Cable", swatch: "var(--chart-cable)" },
  { id: Modality.BODYWEIGHT, label: "Bodyweight", swatch: "var(--chart-bodyweight)" },
] as const;

export type ModalityTab = (typeof MODALITY_TABS)[number]["id"];

export interface ModalityTabsProps {
  value: ModalityTab;
  onChange: (modality: ModalityTab) => void;
  label?: string;
  className?: string;
}

/** Free weight · Machine · Cable · Bodyweight. The square swatch uses the chart palette so the colour is consistent with the charts (never the only cue: the label is always shown). */
export function ModalityTabs({ value, onChange, label = "Modality", className }: ModalityTabsProps) {
  return (
    <Tabs
      className={clsx("tabs-o--modality", className)}
      label={label}
      value={value}
      onChange={(id) => onChange(id as ModalityTab)}
      items={MODALITY_TABS.map((m) => ({
        id: m.id,
        label: (
          <>
            <span className="tabs-o__swatch" aria-hidden="true" style={{ background: m.swatch }} />
            {m.label}
          </>
        ),
      }))}
    />
  );
}
