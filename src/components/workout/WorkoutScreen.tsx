"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { repo, useLive } from "@/client/repo";
import { useOnSynced } from "@/client/sync";
import { Skel, SkeletonPage } from "@/components/shell/Skeleton";
import { SaveTemplateModal } from "@/components/templates/SaveTemplateModal";
import { PageIntro } from "@/components/ui/PageIntro";
import { useToast } from "@/components/ui/Toast";
import type { WorkoutRow } from "@/contracts/entities";
import { setWorkoutActive } from "@/lib/pwa";
import { markAnnounced, wasAnnounced } from "./actions";
import { ActiveWorkout } from "./ActiveWorkout";
import { FinishSheet } from "./FinishSheet";
import { useWorkoutPrefs } from "./prefs";
import { describePr } from "./prs";
import { finishWorkout, saveWorkoutAsTemplate, startWorkout } from "./session";
import { StartWorkoutCard } from "./StartWorkoutCard";
import type { WorkoutSummary } from "./view";

type FinishState = { phase: "confirm" | "done"; workoutId: string; summary: WorkoutSummary };

/**
 * /workout: a Dexie-only client page. It never calls the network or a Server Action: the active workout, templates, exercises and
 * history all come from `repo`, so it works offline after the first load.
 */
export function WorkoutScreen() {
  const prefs = useWorkoutPrefs();
  const { toast } = useToast();
  const active = useLive(async () => ({ workout: (await repo.workouts.active()) ?? null }));
  const templates = useLive(async () => (await repo.templates.list()).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)));
  const [busy, setBusy] = useState(false);
  const [finish, setFinish] = useState<FinishState | null>(null);
  const [templateFor, setTemplateFor] = useState<string | null>(null);
  const ownWorkouts = useRef(new Set<string>());

  const activeId = active?.workout?.id;
  useEffect(() => {
    if (activeId) ownWorkouts.current.add(activeId);
  }, [activeId]);
  useEffect(() => {
    if (active && !active.workout) setWorkoutActive(false);
  }, [active]);

  // PRs the server confirms after a sync: only this device's workouts, only real improvements, each once.
  useOnSynced((info) => {
    for (const pr of info.newPrs) {
      if (pr.previousValue == null || !ownWorkouts.current.has(pr.workoutId) || pr.type === "MAX_SESSION_VOLUME" || wasAnnounced(pr)) continue;
      markAnnounced(pr);
      toast({ kind: "pr", title: "New PR confirmed", description: describePr(pr, prefs.unit), duration: 6000 });
    }
  });

  const start = async (templateId: string | null) => {
    setBusy(true);
    try {
      const template = templateId ? await repo.templates.get(templateId) : null;
      const workout: WorkoutRow = await startWorkout(repo, { template, unit: prefs.unit });
      ownWorkouts.current.add(workout.id);
      setWorkoutActive(true);
    } catch (error) {
      toast({ kind: "error", title: "Could not start the workout", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const confirmFinish = async () => {
    if (!finish) return;
    setBusy(true);
    try {
      await finishWorkout(repo, finish.workoutId);
      setWorkoutActive(false);
      setFinish({ ...finish, phase: "done" });
    } catch (error) {
      toast({ kind: "error", title: "Could not finish the workout", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const sheets = (
    <>
      <FinishSheet
        open={finish !== null}
        phase={finish?.phase ?? "confirm"}
        summary={finish?.summary ?? null}
        unit={prefs.unit}
        busy={busy}
        historyHref={finish ? `/history/${finish.workoutId}` : undefined}
        onConfirm={() => void confirmFinish()}
        onClose={() => setFinish(null)}
        onSaveTemplate={finish?.phase === "done" ? () => setTemplateFor(finish.workoutId) : undefined}
      />
      <SaveTemplateModal
        open={templateFor !== null}
        onClose={() => setTemplateFor(null)}
        onSave={async (name, folder) => {
          if (!templateFor) return;
          await saveWorkoutAsTemplate(repo, templateFor, name, folder);
          toast({ kind: "success", title: "Template saved", description: name });
        }}
      />
    </>
  );

  // Until Dexie answers (and in the server-rendered HTML) show the shape of the screen, not a word: the same blocks the app's route
  // skeletons use, so the page has its height from the first paint.
  if (!active) {
    return (
      <SkeletonPage label="workout">
        <div className="skel-rows">
          <Skel h="var(--tap-target)" />
          <Skel h="12rem" />
          <Skel h="6rem" />
        </div>
      </SkeletonPage>
    );
  }

  return (
    <>
      <h1 className="sr-only">Workout</h1>
      {active.workout ? (
        <ActiveWorkout
          key={active.workout.id}
          workout={active.workout}
          onFinish={(summary) => active.workout && setFinish({ phase: "confirm", workoutId: active.workout.id, summary })}
          onSaveTemplate={setTemplateFor}
          onDiscarded={() => toast({ kind: "info", title: "Workout discarded" })}
        />
      ) : (
        <div className="wk-idle">
          <PageIntro id="workout">Start an empty workout or one of your templates. Add exercises, log each set, then tap Finish to save it.</PageIntro>
          <StartWorkoutCard
            activeWorkout={null}
            templates={templates ?? []}
            busy={busy}
            onStartEmpty={() => void start(null)}
            onStartFromTemplate={(id) => void start(id)}
            onResume={() => undefined}
          />
          <nav className="wk-idle__links" aria-label="Workout shortcuts">
            <Link href="/templates">Templates</Link>
            <Link href="/history">History</Link>
            <Link href="/settings/machines">Machines</Link>
          </nav>
        </div>
      )}
      {sheets}
    </>
  );
}
