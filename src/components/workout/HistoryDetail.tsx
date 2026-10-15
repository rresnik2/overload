"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { SaveTemplateModal } from "@/components/templates/SaveTemplateModal";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Sheet";
import { Term } from "@/components/ui/Term";
import { useToast } from "@/components/ui/Toast";
import { formatWeight } from "@/lib/units";
import { useWorkoutActions } from "./actions";
import { ExerciseBlock } from "./ExerciseBlock";
import { formatClock } from "./labels";
import { useWorkoutPrefs } from "./prefs";
import { headlinePr, describePr } from "./prs";
import { saveWorkoutAsTemplate, supersetLabels } from "./session";
import { loadWorkoutView, summarizeWorkout, workoutDateLabel } from "./view";

/** A past workout: edit or delete sets and exercises, rename, save as a template, delete the workout. All writes through `repo`. */
export function HistoryDetail({ id }: { id: string }) {
  const prefs = useWorkoutPrefs();
  const router = useRouter();
  const { toast } = useToast();
  const view = useLive(() => loadWorkoutView(repo, id, { withLast: false }), [id]);
  const exercises = view?.exercises ?? [];
  const actionsFor = useWorkoutActions({ workoutId: id, prefs, exercises, completeNewSetsAt: view?.workout.endedAt ?? new Date().toISOString() });
  const [title, setTitle] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templating, setTemplating] = useState(false);

  if (view === undefined) return <p className="wk-muted" role="status">Loading workout…</p>;
  if (view === null) return <EmptyState title="Workout not found" action={<Link href="/history" className="ui-btn ui-btn--ink">Back to history</Link>} />;
  const { workout } = view;
  const summary = summarizeWorkout(view, new Date(workout.endedAt ?? workout.startedAt).getTime(), headlinePr);
  const labels = supersetLabels(exercises.map((e) => e.we));

  return (
    <div className="wk-active">
      <p className="meta-line">{workoutDateLabel(workout.localDate)}</p>
      <Field
        label="Workout name"
        placeholder="Workout"
        value={title ?? workout.title ?? ""}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          const next = (title ?? "").trim() || null;
          const had = title !== null;
          setTitle(null);
          if (had && next !== workout.title) void repo.workouts.update(workout.id, { title: next });
        }}
      />
      <p className="wk-stats num">
        <span>{workout.endedAt ? formatClock(new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) : "In progress"}</span>
        <span>{summary.sets} sets</span>
        <span>
          {formatWeight(summary.volumeKg, prefs.unit)} <Term id="volumeLoad">volume</Term>
        </span>
        {summary.prSets > 0 ? (
          <span>
            {summary.prSets} <Term id="personalRecord">PR{summary.prSets === 1 ? "" : "s"}</Term>
          </span>
        ) : null}
      </p>
      {summary.prs.length > 0 ? (
        <ul className="wk-summary__prs" aria-label="Personal records">
          {summary.prs.map((p) => (
            <li key={p.setId}>
              <strong>{p.exerciseName}</strong>: {describePr(p.headline, prefs.unit)}
            </li>
          ))}
        </ul>
      ) : null}

      {exercises.length === 0 ? (
        <EmptyState title="No exercises" description="Every exercise was removed from this workout." />
      ) : (
        exercises.map((item, i) => (
          <ExerciseBlock
            key={item.we.id}
            item={item}
            prefs={prefs}
            prs={view.prs}
            actions={actionsFor(item)}
            supersetLabel={labels.get(item.we.id)}
            canMoveUp={i > 0}
            canMoveDown={i < exercises.length - 1}
            canLinkNext={i < exercises.length - 1}
            showGhost={false}
          />
        ))
      )}

      <div className="wk-card__actions">
        <Button variant="ink" onClick={() => setTemplating(true)}>
          Save as template
        </Button>
        <Button variant="ghost" onClick={() => router.push("/history")}>
          Back
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete workout
        </Button>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this workout?"
        description="Its sets are removed from your history and progress."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.workouts.remove(workout.id);
                router.push("/history");
              }}
            >
              Delete workout
            </Button>
          </>
        }
      />
      <SaveTemplateModal
        open={templating}
        defaultName={workout.title ?? ""}
        onClose={() => setTemplating(false)}
        onSave={async (name, folder) => {
          await saveWorkoutAsTemplate(repo, workout.id, name, folder);
          toast({ kind: "success", title: "Template saved", description: name, action: { label: "View templates", onClick: () => router.push("/templates") } });
        }}
      />
    </div>
  );
}
