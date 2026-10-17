"use client";
import { Dumbbell, Play } from "lucide-react";
import { HardCard } from "@/components/primitives/HardCard";
import { Button } from "@/components/ui/Button";
import type { WorkoutRow, TemplateRow } from "@/contracts/entities";
import { ElapsedClock } from "./ElapsedClock";

export interface StartWorkoutCardProps {
  /** The unfinished workout, if any: the card then offers to resume it. */
  activeWorkout: Pick<WorkoutRow, "id" | "title" | "startedAt"> | null;
  /** Templates to start from (already ordered). */
  templates: Pick<TemplateRow, "id" | "name" | "folder">[];
  onStartEmpty: () => void;
  onStartFromTemplate: (templateId: string) => void;
  /** Resume the active workout (navigate to /workout when used outside the workout page). */
  onResume: () => void;
  /** Disables the buttons while a start is in flight. */
  busy?: boolean;
  /** Epoch ms for the elapsed clock of the active workout (default: a live clock). */
  now?: number;
  /** Max templates listed (default 4). */
  maxTemplates?: number;
}

/**
 * Start a workout (empty or from a template) or resume the active one. Props only, no data fetching: the workout page and the
 * Wave 3 /today both feed it from `repo` and wire the callbacks.
 */
export function StartWorkoutCard({ activeWorkout, templates, onStartEmpty, onStartFromTemplate, onResume, busy = false, now, maxTemplates = 4 }: StartWorkoutCardProps) {
  if (activeWorkout) {
    return (
      <HardCard as="section" className="wk-start" aria-label="Workout in progress">
        <p className="meta-line">In progress</p>
        <h2 className="wk-start__title type-display-m">{activeWorkout.title ?? "Workout"}</h2>
        <ElapsedClock className="wk-muted num" startedAt={activeWorkout.startedAt} prefix="Started " suffix=" ago" now={now} />
        <Button block icon={<Play size={18} />} onClick={onResume}>
          Resume workout
        </Button>
      </HardCard>
    );
  }
  return (
    <HardCard as="section" className="wk-start" aria-label="Start a workout">
      <h2 className="wk-start__title type-display-m">Start a workout</h2>
      <Button block loading={busy} icon={<Dumbbell size={18} />} onClick={onStartEmpty}>
        Start empty workout
      </Button>
      {templates.length > 0 ? (
        <>
          <p className="wk-start__sub">Or from a template</p>
          <ul className="wk-start__templates">
            {templates.slice(0, maxTemplates).map((t) => (
              <li key={t.id}>
                <Button variant="ink" block disabled={busy} onClick={() => onStartFromTemplate(t.id)} aria-label={`Start ${t.name}`}>
                  {t.folder ? `${t.folder} / ${t.name}` : t.name}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </HardCard>
  );
}
