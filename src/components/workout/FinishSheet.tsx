"use client";
import { Star } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Stat } from "@/components/ui/Stat";
import { Term } from "@/components/ui/Term";
import type { WeightUnit } from "@/contracts/enums";
import { formatWeight } from "@/lib/units";
import { formatClock } from "./labels";
import { describePr } from "./prs";
import type { WorkoutSummary } from "./view";

export interface FinishSheetProps {
  open: boolean;
  /** confirm: asks to finish; done: the workout is saved. */
  phase: "confirm" | "done";
  summary: WorkoutSummary | null;
  unit: WeightUnit;
  busy?: boolean;
  historyHref?: string;
  onConfirm: () => void;
  onClose: () => void;
  onSaveTemplate?: () => void;
}

/** Finish summary: duration, sets, volume and the PRs of the session. */
export function FinishSheet({ open, phase, summary, unit, busy, historyHref, onConfirm, onClose, onSaveTemplate }: FinishSheetProps) {
  const done = phase === "done";
  const nothing = summary !== null && summary.sets + summary.warmupSets === 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? "Workout saved" : "Finish workout?"}
      description={done ? "Synced when you have signal." : nothing ? "No sets are completed yet." : undefined}
      footer={
        done ? (
          <>
            {onSaveTemplate ? (
              <Button variant="ink" onClick={onSaveTemplate}>
                Save as template
              </Button>
            ) : null}
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Keep going
            </Button>
            <Button loading={busy} disabled={nothing} onClick={onConfirm}>
              Finish workout
            </Button>
          </>
        )
      }
    >
      {summary ? (
        <div className="wk-summary" data-testid="finish-summary">
          <div className="wk-summary__stats">
            <Stat label="Duration" value={formatClock(summary.durationMs)} size="sm" />
            <Stat label="Sets" value={summary.sets} size="sm" />
            <Stat label="Volume" value={formatWeight(summary.volumeKg, unit, { withUnit: false })} unit={unit === "KG" ? "kg" : "lb"} size="sm" />
            <Stat label="PRs" value={summary.prSets} size="sm" pr={summary.prSets > 0} />
          </div>
          {summary.prs.length > 0 ? (
            <ul className="wk-summary__prs" aria-label="Personal records">
              {summary.prs.map((p) => (
                <li key={p.setId}>
                  <Star size={14} aria-hidden="true" fill="currentColor" strokeWidth={0} /> <strong>{p.exerciseName}</strong>: {describePr(p.headline, unit)}
                </li>
              ))}
            </ul>
          ) : null}
          {!done ? (
            <p className="wk-muted">
              Finishing saves this workout, checks it for <Term id="personalRecord">personal records</Term> and updates your charts.
            </p>
          ) : null}
          {!done && summary.unfinishedSets > 0 ? (
            <p className="wk-muted">
              {summary.unfinishedSets} unfinished {summary.unfinishedSets === 1 ? "set" : "sets"} will be removed.
            </p>
          ) : null}
          {done && historyHref ? <Link href={historyHref}>View in history</Link> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
