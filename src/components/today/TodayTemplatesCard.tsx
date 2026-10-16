"use client";
// /today: "Your templates": up to four templates, most recently started first, each with Start and Edit.
import clsx from "clsx";
import { Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { Button, ButtonLink } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { startWorkout, templatesByRecentUse } from "@/components/workout/session";
import type { WeightUnit } from "@/contracts/enums";
import { setWorkoutActive } from "@/lib/pwa";

const MAX_TEMPLATES = 4;

export function TodayTemplatesCard({ unit }: { unit: WeightUnit }) {
  const router = useRouter();
  const { toast } = useToast();
  const data = useLive(async () => {
    const [templates, workouts, active] = await Promise.all([repo.templates.list(), repo.workouts.list(), repo.workouts.active()]);
    const counts: Record<string, number> = {};
    for (const t of templates) counts[t.id] = (await repo.templates.exercisesOf(t.id)).length;
    return { templates: templatesByRecentUse(templates, workouts), counts, active: active ?? null, total: templates.length };
  });
  const [busy, setBusy] = useState(false);

  const start = async (templateId: string) => {
    setBusy(true);
    try {
      const template = await repo.templates.get(templateId);
      await startWorkout(repo, { template, unit });
      setWorkoutActive(true);
      router.push("/workout");
    } catch (error) {
      toast({ kind: "error", title: "Could not start the workout", description: error instanceof Error ? error.message : undefined });
      setBusy(false);
    }
  };

  const shown = data?.templates.slice(0, MAX_TEMPLATES) ?? [];
  return (
    <section className={clsx("today-panel today-templates", data === undefined && "today-templates--loading")} aria-labelledby="today-templates-title">
      <div className="today-templates__head">
        <h2 id="today-templates-title" className="type-display-s today-templates__title">
          Your templates
        </h2>
        <InfoHint term="template" />
      </div>
      {data === undefined ? (
        <p className="today-muted" role="status">
          Loading templates…
        </p>
      ) : shown.length === 0 ? (
        <>
          <p className="today-muted">No templates yet. A template is a saved workout plan you can start in one tap.</p>
          <ButtonLink href="/templates" variant="ink">
            Create a template
          </ButtonLink>
        </>
      ) : (
        <>
          <ul className="today-templates__list">
            {shown.map((t) => (
              <li key={t.id} className="today-templates__row">
                <div className="today-templates__name">
                  <strong>{t.folder ? `${t.folder} / ${t.name}` : t.name}</strong>
                  <span className="today-muted num">
                    {data.counts[t.id]} {data.counts[t.id] === 1 ? "exercise" : "exercises"}
                  </span>
                </div>
                <Button icon={<Play size={16} />} disabled={busy || data.active !== null} onClick={() => void start(t.id)} aria-label={`Start ${t.name}`}>
                  Start
                </Button>
                <ButtonLink href={`/templates/${t.id}`} variant="ghost" aria-label={`Edit ${t.name}`}>
                  Edit
                </ButtonLink>
              </li>
            ))}
          </ul>
          <p>
            <Link href="/templates" className="link-underline">
              All templates{data.total > MAX_TEMPLATES ? ` (${data.total})` : ""}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
