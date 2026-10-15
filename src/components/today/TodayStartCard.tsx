"use client";
// /today: the Start-a-workout card, wired to `repo` (Dexie + outbox) so starting works offline, then hands over to /workout.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { useToast } from "@/components/ui/Toast";
import { StartWorkoutCard } from "@/components/workout/StartWorkoutCard";
import { startWorkout } from "@/components/workout/session";
import type { WeightUnit } from "@/contracts/enums";
import { setWorkoutActive } from "@/lib/pwa";

export function TodayStartCard({ unit }: { unit: WeightUnit }) {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLive(async () => ({
    workout: (await repo.workouts.active()) ?? null,
    templates: (await repo.templates.list()).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0)),
  }));
  const [busy, setBusy] = useState(false);

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

  return (
    <StartWorkoutCard
      activeWorkout={data?.workout ?? null}
      templates={data?.templates ?? []}
      busy={busy || data === undefined}
      onStartEmpty={() => void start(null)}
      onStartFromTemplate={(id) => void start(id)}
      onResume={() => router.push("/workout")}
    />
  );
}
