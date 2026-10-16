"use client";
import clsx from "clsx";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { useDialLayout } from "./layout";
import { useExerciseTabSide } from "./exerciseTabSide";

export interface ExerciseTabItem {
  id: string;
  name: string;
  /** Sets logged and sets planned. */
  done: number;
  total: number;
}

export interface ExerciseTabProps {
  /** Exercises in workout order. */
  items: readonly ExerciseTabItem[];
  /** Index of the focused exercise, or -1 when none is (every exercise is done). */
  index: number;
  onGo: (index: number) => void;
}

/**
 * The exercise tab: a slim control fixed to the left or right screen edge (Settings > Profile) on phones, to jump between
 * the stacked exercises. Up/down chevrons go to the previous/next one (no wrap-around); the "2/5" count opens a list of every
 * exercise with its progress. Hidden on a desktop and with fewer than two exercises.
 */
export function ExerciseTab({ items, index, onGo }: ExerciseTabProps) {
  const side = useExerciseTabSide();
  const dialLayout = useDialLayout();
  const [listOpen, setListOpen] = useState(false);
  if (!dialLayout || items.length < 2) return null;

  const prev = index > 0 ? index - 1 : index === -1 ? items.length - 1 : -1;
  const next = index >= 0 && index < items.length - 1 ? index + 1 : -1;
  const jumpLabel = index >= 0 ? `Jump to an exercise, ${index + 1} of ${items.length}` : `Jump to an exercise, ${items.length} exercises`;

  return (
    <>
      <nav className={clsx("wk-xtab", `wk-xtab--${side}`)} data-side={side} aria-label="Exercises" data-no-swipe>
        <button type="button" className="wk-xtab__btn" disabled={prev < 0} aria-label={prev >= 0 ? `Previous exercise: ${items[prev]?.name}` : "Previous exercise"} onClick={() => onGo(prev)}>
          <ChevronUp size={20} aria-hidden="true" />
        </button>
        <button type="button" className="wk-xtab__btn wk-xtab__count num" aria-haspopup="dialog" aria-label={jumpLabel} onClick={() => setListOpen(true)}>
          {index >= 0 ? index + 1 : "–"}/{items.length}
        </button>
        <button type="button" className="wk-xtab__btn" disabled={next < 0} aria-label={next >= 0 ? `Next exercise: ${items[next]?.name}` : "Next exercise"} onClick={() => onGo(next)}>
          <ChevronDown size={20} aria-hidden="true" />
        </button>
      </nav>
      <Sheet open={listOpen} onClose={() => setListOpen(false)} title="Jump to an exercise">
        <ol className="wk-jump">
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className="wk-jump__row"
                aria-current={i === index ? "true" : undefined}
                aria-label={`${item.name}, ${item.done} of ${item.total} ${item.total === 1 ? "set" : "sets"} done`}
                onClick={() => {
                  setListOpen(false);
                  onGo(i);
                }}
              >
                <span className="wk-jump__name">{item.name}</span>
                <span className="wk-jump__meta num">
                  {i === index ? "Now · " : ""}
                  {item.done}/{item.total} sets
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
