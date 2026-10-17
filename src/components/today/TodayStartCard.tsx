"use client";
// /today: the "Next up" card, wired to `repo` (Dexie + outbox) so starting works offline, then hands over to /workout.
// Next up = the template after the one you started last (see next-up.ts); without templates, the named session you did least
// recently (an upper/lower or A/B rotation), started as a repeat of that workout. The first lift is drawn loaded with its last
// top set, the rest are listed with small drawings. With nothing to suggest it is just "Start empty workout".
import clsx from "clsx";
import { Dumbbell, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { EquipmentArt } from "@/components/workout/equipment/EquipmentArt";
import { LoadCaption } from "@/components/workout/equipment/LoadCaption";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/components/workout/hooks";
import { formatClock } from "@/components/workout/labels";
import { startWorkout, unitForSet } from "@/components/workout/session";
import type { ExerciseRow, WorkoutSetRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import { lastLoadSet } from "@/lib/analytics/last-load";
import { setWorkoutActive } from "@/lib/pwa";
import { fromKg, round } from "@/lib/units";
import { donePlanLine, nextFromHistory, nextTemplate, planLine, topSet } from "./next-up";

const MAX_ROWS = 5;

interface Line {
  id: string;
  exercise: ExerciseRow;
  plan: string | null;
  /** The last top set, shown in its own unit; null when never done. */
  last: { weight: number | null; unit: WeightUnit; set: string | null } | null;
}

/** The last top set of an exercise before today, in the unit it was logged in. */
async function lastTop(exercise: ExerciseRow, machineProfileId: string | null, preference: WeightUnit): Promise<Line["last"]> {
  const last = await repo.sets.lastTime({ exerciseId: exercise.id, machineProfileId });
  const top = last ? topSet(last.sets) : null;
  if (!top) return null;
  const unit = unitForSet(top, null, preference);
  return { weight: top.weightKg == null ? null : round(fromKg(top.weightKg, unit), 1), unit, set: lastLoadSet({ weightKg: top.weightKg, reps: top.reps }, exercise.loadType, unit) };
}

/** `expectSuggestion`: the lifter has history, so a suggestion is coming; its height is held while the local database answers. */
export function TodayStartCard({ unit, expectSuggestion = false }: { unit: WeightUnit; expectSuggestion?: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLive(async () => {
    const [workout, templates, workouts] = await Promise.all([repo.workouts.active(), repo.templates.list(), repo.workouts.list()]);
    const template = nextTemplate(templates, workouts);
    const repeat = template ? null : nextFromHistory(workouts);
    let rows: { id: string; exerciseId: string; machineProfileId: string | null; plan: string | null }[] = [];
    if (template) {
      rows = (await repo.templates.exercisesOf(template.id))
        .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
        .map((te) => ({ id: te.id, exerciseId: te.exerciseId, machineProfileId: te.machineProfileId, plan: planLine(te) }));
    } else if (repeat) {
      const sets = await repo.sets.forWorkout(repeat.id);
      rows = (await repo.workoutExercises.forWorkout(repeat.id)).map((we) => ({
        id: we.id,
        exerciseId: we.exerciseId,
        machineProfileId: we.machineProfileId,
        plan: donePlanLine(sets.filter((s: WorkoutSetRow) => s.workoutExerciseId === we.id)),
      }));
    }
    const lines: Line[] = [];
    for (const [i, row] of rows.entries()) {
      const exercise = await repo.exercises.get(row.exerciseId);
      if (!exercise) continue;
      lines.push({ id: row.id, exercise, plan: row.plan, last: i < MAX_ROWS ? await lastTop(exercise, row.machineProfileId, unit) : null });
    }
    const next = template ? { kind: "template" as const, id: template.id, name: template.folder ? `${template.folder} / ${template.name}` : template.name, short: template.name } : repeat ? { kind: "repeat" as const, id: repeat.id, name: repeat.title!.trim(), short: repeat.title!.trim() } : null;
    return { workout: workout ?? null, next, lines };
  });
  const [busy, setBusy] = useState(false);
  const tick = useNow(1000, data?.workout != null);

  const start = async (next: { kind: "template" | "repeat"; id: string } | null) => {
    setBusy(true);
    try {
      const template = next?.kind === "template" ? await repo.templates.get(next.id) : null;
      const repeat = next?.kind === "repeat" ? await repo.workouts.get(next.id) : null;
      await startWorkout(repo, { template, repeat, unit });
      setWorkoutActive(true);
      router.push("/workout");
    } catch (error) {
      toast({ kind: "error", title: "Could not start the workout", description: error instanceof Error ? error.message : undefined });
      setBusy(false);
    }
  };

  if (data?.workout) {
    const elapsed = tick - new Date(data.workout.startedAt).getTime();
    return (
      <section className="today-panel today-next" aria-label="Workout in progress">
        <p className="type-label today-label">In progress</p>
        <h2 className="type-display-s today-next__title">{data.workout.title ?? "Workout"}</h2>
        <p className="today-muted num">Started {formatClock(elapsed)} ago</p>
        <Button block className="type-display-s today-next__go" icon={<Play size={18} />} onClick={() => router.push("/workout")}>
          Resume workout
        </Button>
      </section>
    );
  }

  const next = data?.next ?? null;
  // a suggestion is on its way: hold the card as "Next up" rather than flashing "Start a workout"
  const waiting = expectSuggestion && data === undefined;
  const [lead, ...rest] = data?.lines ?? [];
  const shown = rest.slice(0, MAX_ROWS - 1);
  const hidden = rest.length - shown.length;
  return (
    <section className={clsx("today-panel today-next", waiting && "today-next--expect")} aria-label={next ? `Next up: ${next.name}` : "Start a workout"}>
      <div className="today-next__head">
        <p className="type-label today-label">{next ? `Next up · ${next.name}` : waiting ? "Next up" : "Start"}</p>
        {next && data ? (
          <span className="today-muted num">
            {data.lines.length} {data.lines.length === 1 ? "exercise" : "exercises"}
          </span>
        ) : null}
      </div>
      {next && lead ? (
        <div className="today-next__lead">
          <EquipmentArt exercise={lead.exercise} unit={lead.last?.unit ?? unit} load={lead.last?.weight ?? null} size="hero" className="today-next__art" />
          <LoadCaption exercise={lead.exercise} unit={lead.last?.unit ?? unit} load={lead.last?.weight ?? null} />
          <h2 className="type-display-m today-next__lift">{lead.exercise.name}</h2>
          <p className="today-next__set num">
            {lead.last?.set ? (
              <>
                <b>{lead.last.set}</b> last time
              </>
            ) : (
              "First time"
            )}
            {lead.plan ? ` · ${lead.plan}` : ""}
          </p>
        </div>
      ) : waiting ? null : (
        <h2 className="type-display-s today-next__title">Start a workout</h2>
      )}
      {next && shown.length > 0 ? (
        <ol className="today-next__then" aria-label="Then">
          {shown.map((row) => (
            <li key={row.id}>
              <EquipmentArt exercise={row.exercise} unit={row.last?.unit ?? unit} load={row.last?.weight ?? null} />
              <span className="today-next__then-text">
                <span className="today-next__then-name">{row.exercise.name}</span>
                <span className="today-muted num">{[row.last?.set, row.plan].filter(Boolean).join(" · ") || "First time"}</span>
              </span>
            </li>
          ))}
          {hidden > 0 ? <li className="today-muted today-next__more">+{hidden} more</li> : null}
        </ol>
      ) : null}
      {next ? (
        <Button block className="type-display-s today-next__go" loading={busy || data === undefined} icon={<Play size={18} />} onClick={() => void start(next)} aria-label={`Start next up: ${next.short}`}>
          Start {next.short}
        </Button>
      ) : null}
      <Button
        block
        variant={next ? "ghost" : "primary"}
        className={next ? "today-next__empty" : "type-display-s today-next__go"}
        loading={!next && (busy || data === undefined)}
        disabled={busy || data === undefined}
        icon={<Dumbbell size={18} />}
        onClick={() => void start(null)}
      >
        Start empty workout
      </Button>
    </section>
  );
}
