"use client";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import type { WeightUnit } from "@/contracts/enums";
import { useFlushOnLeave } from "@/components/ui/commit";
import { parseNumber, round } from "@/lib/units";
import { PANEL_COPY } from "./labels";

export interface WeightReadoutProps {
  /** Position of the set among all sets of the exercise, for accessible names ("Set 3 weight"). */
  ordinal: number;
  unit: WeightUnit;
  /** The label after the number: "KG", "KG / HAND". */
  unitText: string;
  /** The weight in `unit`, or null while nothing is chosen ("—"). */
  value: number | null;
  /** The value comes from last time and has not been entered yet (drawn a little quieter). */
  ghost?: boolean;
  /** A typed weight, exactly as typed (never snapped: the dial inserts an off-step value so it can land on it). */
  onCommit: (value: number) => void;
  /** Largest weight accepted when typing; a bigger one is limited to it. */
  limit?: number;
  onLimited?: (limit: number) => void;
  disabled?: boolean;
}

/**
 * The big weight number. It is a button (with a dotted underline as the cue); a tap swaps it for a decimal input with the text
 * selected. Enter commits and Esc cancels (both return focus to the number), blur commits. Empty or non-numeric text reverts.
 * Typed text is also committed when the page is hidden (the app goes to the background), on `pagehide` and on unmount, as the
 * Dial does, so a weight typed but not confirmed is never lost.
 */
export function WeightReadout({ ordinal, unit, unitText, value, ghost = false, onCommit, limit = 9999, onLimited, disabled }: WeightReadoutProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const live = useRef(false);
  const refocus = useRef(false);
  useFlushOnLeave(() => finish(true, false));

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  const shown = value === null ? "—" : String(value);

  function begin() {
    if (disabled) return;
    live.current = true;
    setDraft(value === null ? "" : String(value));
  }

  function finish(commit: boolean, returnFocus: boolean) {
    if (!live.current) return;
    live.current = false;
    if (commit && draft !== null) {
      const n = parseNumber(draft);
      if (n !== null && n >= 0) {
        const next = round(Math.min(n, limit), 3);
        if (n > limit) onLimited?.(limit);
        onCommit(next);
      }
    }
    refocus.current = returnFocus;
    setDraft(null);
  }

  if (editing) {
    return (
      <input
        ref={input}
        className="wk-readout__input num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={PANEL_COPY.typedWeight(ordinal, unit)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true, false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            finish(true, true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            finish(false, true);
          }
        }}
      />
    );
  }

  return (
    <span className="wk-readout">
      <button
        ref={button}
        type="button"
        className={clsx("wk-readout__num type-readout num", shown.split(".")[0]!.length >= 4 && "wk-readout__num--long", ghost && "wk-readout__num--ghost")}
        aria-label={`${PANEL_COPY.weightFor(ordinal)} ${shown}, tap to type`}
        disabled={disabled}
        onClick={begin}
      >
        {shown}
      </button>
      <span className="wk-readout__unit type-label" aria-hidden="true">
        {unitText}
      </span>
    </span>
  );
}
