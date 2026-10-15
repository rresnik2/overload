"use client";
// /today: the "Next up" card, wired to `repo` (Dexie + outbox) so starting works offline, then hands over to /workout.
// Next up = the template after the one you started last (see next-up.ts); with no templates it is just "Start empty workout".
import { Dumbbell, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useNow } from "@/components/workout/hooks";
import { formatClock } from "@/components/workout/labels";
import { startWorkout } from "@/components/workout/session";
import type { WeightUnit } from "@/contracts/enums";
import { setWorkoutActive } from "@/lib/pwa";
import { nextTemplate, planLine } from "./next-up";

const MAX_ROWS = 5;

export function TodayStartCard({ unit }: { unit: WeightUnit }) {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLive(async () => {
    const [workout, templates, workouts] = await Promise.all([repo.workouts.active(), repo.templates.list(), repo.workouts.list()]);
    const next = nextTemplate(templates, workouts);
    const plan = next
      ? await Promise.all(
          (await repo.templates.exercisesOf(next.id))
            .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
            .map(async (te) => ({ id: te.id, name: (await repo.exercises.get(te.exerciseId))?.name ?? "Exercise", line: planLine(te) })),
        )
      : [];
    return { workout: workout ?? null, next: next ? { id: next.id, name: next.name, folder: next.folder } : null, plan };
  });
  const [busy, setBusy] = useState(false);
  const tick = useNow(1000, data?.workout != null);

  const start = async (templateId: string | null) => {
    setBusy(true);
    try {
      const template = templateId ? await repo.templates.get(templateId) : null;
      await startWorkout(repo, { template, unit });
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
  const shown = data?.plan.slice(0, MAX_ROWS) ?? [];
  const hidden = (data?.plan.length ?? 0) - shown.length;
  const title = next ? (next.folder ? `${next.folder} / ${next.name}` : next.name) : "Start a workout";
  return (
    <section className="today-panel today-next" aria-label="Start a workout">
      <p className="type-label today-label">{next ? "Next up" : "Start"}</p>
      <h2 className="type-display-s today-next__title">{title}</h2>
      {next && shown.length > 0 ? (
        <ol className="today-next__list num">
          {shown.map((row) => (
            <li key={row.id}>
              <span>{row.name}</span>
              <span>{row.line}</span>
            </li>
          ))}
          {hidden > 0 ? (
            <li>
              <span>+{hidden} more</span>
              <span aria-hidden="true" />
            </li>
          ) : null}
        </ol>
      ) : null}
      {next ? (
        <Button block className="type-display-s today-next__go" loading={busy || data === undefined} icon={<Play size={18} />} onClick={() => void start(next.id)} aria-label={`Start next up: ${next.name}`}>
          Start {next.name}
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
