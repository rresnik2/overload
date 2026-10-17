"use client";
import { Star } from "lucide-react";
import Link from "next/link";
import { EquipmentArt } from "@/components/workout/equipment/EquipmentArt";
import { LoadCaption } from "@/components/workout/equipment/LoadCaption";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Stat } from "@/components/ui/Stat";
import { Term } from "@/components/ui/Term";
import type { WeightUnit } from "@/contracts/enums";
import { formatNumber, formatWeight, fromKg, round } from "@/lib/units";
import { formatClock } from "./labels";
import { describePr } from "./prs";
import { unitForSet } from "./session";
import type { WorkoutSummary } from "./view";

/**
 * The PR moment: the record set drawn on its equipment, the plates sliding on heaviest first (nothing moves under reduced motion),
 * then the set in the readout type and what it beat.
 */
function PrMoment({ pr, unit }: { pr: WorkoutSummary["prs"][number]; unit: WeightUnit }) {
  const setUnit = unitForSet({ inputUnit: pr.inputUnit }, null, unit);
  const weight = pr.weightKg == null ? null : round(fromKg(pr.weightKg, setUnit), 1);
  const added = pr.exercise.loadType === "BODYWEIGHT_PLUS";
  return (
    <section className="wk-pr" aria-label={`New personal record: ${pr.exerciseName}`} data-testid="pr-moment">
      <p className="type-label wk-pr__label">
        <Star size={14} aria-hidden="true" fill="currentColor" strokeWidth={0} /> New PR · {pr.exerciseName}
      </p>
      <EquipmentArt exercise={pr.exercise} unit={setUnit} load={weight} size="hero" animate className="wk-pr__art" />
      <LoadCaption exercise={pr.exercise} unit={setUnit} load={weight} />
      {weight !== null && weight > 0 && pr.reps != null ? (
        <p className="wk-pr__set num">
          {added ? <span className="wk-pr__u">BW +</span> : null}
          <span className="type-readout">{formatNumber(weight, 1)}</span>
          <span className="wk-pr__u">{setUnit === "LB" ? "lb" : "kg"}</span>
          <span className="wk-pr__x" aria-label="times">
            ×
          </span>
          <span className="type-readout">{pr.reps}</span>
        </p>
      ) : null}
      <p className="wk-pr__line num">{describePr(pr.headline, unit)}</p>
    </section>
  );
}

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
              <Button variant="ghost" onClick={onSaveTemplate}>
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
          {summary.prs[0] ? <PrMoment pr={summary.prs[0]} unit={unit} /> : null}
          <div className="wk-summary__stats">
            <Stat label="Duration" value={formatClock(summary.durationMs)} size="sm" />
            <Stat label="Sets" value={summary.sets} size="sm" />
            <Stat label="Volume" value={formatWeight(summary.volumeKg, unit, { withUnit: false })} unit={unit === "KG" ? "kg" : "lb"} size="sm" />
            <Stat label="PRs" value={summary.prSets} size="sm" pr={summary.prSets > 0} />
          </div>
          {summary.prs.length > 1 ? (
            <ul className="wk-summary__prs" aria-label="More personal records">
              {summary.prs.slice(1).map((p) => (
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
