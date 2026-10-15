"use client";
import { ArrowDown, ArrowUp, Copy, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { HardCard } from "@/components/primitives/HardCard";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import type { TemplateRow } from "@/contracts/entities";
import { useWorkoutPrefs } from "@/components/workout/prefs";
import { duplicateTemplate, movedPosition, startWorkout, templatePositionAfter } from "@/components/workout/session";

const byPosition = (a: { position: string }, b: { position: string }) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/** Templates grouped by folder, ordered by position. Start, edit, reorder, delete; everything through `repo`. */
export function TemplatesView() {
  const prefs = useWorkoutPrefs();
  const router = useRouter();
  const { toast } = useToast();
  const data = useLive(async () => {
    const templates = (await repo.templates.list()).sort(byPosition);
    const counts: Record<string, number> = {};
    for (const t of templates) counts[t.id] = (await repo.templates.exercisesOf(t.id)).length;
    return { templates, counts, active: (await repo.workouts.active()) ?? null };
  });
  const [deleting, setDeleting] = useState<TemplateRow | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const existing = await repo.templates.list();
      const t = await repo.templates.create({ name: "New template", position: templatePositionAfter(existing.sort(byPosition)) });
      router.push(`/templates/${t.id}`);
    } catch (e) {
      toast({ kind: "error", title: "Could not create the template", description: e instanceof Error ? e.message : undefined });
      setBusy(false);
    }
  };

  const start = async (t: TemplateRow) => {
    try {
      await startWorkout(repo, { template: t, unit: prefs.unit });
      router.push("/workout");
    } catch (e) {
      toast({ kind: "error", title: "Could not start the workout", description: e instanceof Error ? e.message : undefined });
    }
  };

  const duplicate = async (t: TemplateRow) => {
    try {
      const copy = await duplicateTemplate(repo, t.id);
      toast({ kind: "success", title: "Template duplicated", description: copy.name, action: { label: "Edit", onClick: () => router.push(`/templates/${copy.id}`) } });
    } catch (e) {
      toast({ kind: "error", title: "Could not duplicate the template", description: e instanceof Error ? e.message : undefined });
    }
  };

  const move = async (t: TemplateRow, direction: "up" | "down") => {
    const position = movedPosition(data?.templates ?? [], t.id, direction);
    if (position) await repo.templates.update(t.id, { position });
  };

  if (!data) return <p className="wk-muted" role="status">Loading templates…</p>;
  const { templates, counts, active } = data;

  if (templates.length === 0) {
    return (
      <EmptyState
        title="No templates yet"
        description="A template is a list of exercises with target sets and reps. Create one, or finish a workout and save it as a template."
        action={
          <Button loading={busy} onClick={() => void create()} icon={<Plus size={18} />}>
            New template
          </Button>
        }
      />
    );
  }

  const folders = [...new Set(templates.map((t) => t.folder ?? ""))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return (
    <>
      <div className="wk-card__actions">
        <Button loading={busy} onClick={() => void create()} icon={<Plus size={18} />}>
          New template
        </Button>
        {active ? <Link href="/workout">A workout is in progress</Link> : null}
      </div>
      {folders.map((folder) => (
        <section key={folder || "root"} aria-label={folder || "Templates"}>
          {folder ? <h2 className="wk-group">{folder}</h2> : null}
          <ul className="wk-list">
            {templates
              .filter((t) => (t.folder ?? "") === folder)
              .map((t) => (
                <li key={t.id}>
                  <HardCard as="article" className="wk-card">
                    <div className="wk-card__head">
                      <div>
                        <h3 className="wk-card__title">
                          <Link href={`/templates/${t.id}`}>{t.name}</Link>
                        </h3>
                        <p className="wk-muted num">
                          {counts[t.id]} {counts[t.id] === 1 ? "exercise" : "exercises"}
                        </p>
                      </div>
                      <div className="wk-card__actions">
                        <button type="button" className="wk-icon-btn" aria-label={`Move ${t.name} up`} onClick={() => void move(t, "up")}>
                          <ArrowUp size={18} aria-hidden="true" />
                        </button>
                        <button type="button" className="wk-icon-btn" aria-label={`Move ${t.name} down`} onClick={() => void move(t, "down")}>
                          <ArrowDown size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <div className="wk-card__actions">
                      <Button icon={<Play size={18} />} disabled={Boolean(active)} onClick={() => void start(t)} aria-label={`Start ${t.name}`}>
                        Start
                      </Button>
                      <Button variant="ghost" onClick={() => router.push(`/templates/${t.id}`)} aria-label={`Edit ${t.name}`}>
                        Edit
                      </Button>
                      <Button variant="ghost" icon={<Copy size={18} />} onClick={() => void duplicate(t)} aria-label={`Duplicate ${t.name}`}>
                        Duplicate
                      </Button>
                      <button type="button" className="wk-icon-btn" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                        <Trash2 size={18} aria-hidden="true" />
                      </button>
                    </div>
                  </HardCard>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete template?"
        description={deleting ? `"${deleting.name}" will be removed. Workouts you already logged from it stay in your history.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleting) await repo.templates.remove(deleting.id);
                setDeleting(null);
              }}
            >
              Delete template
            </Button>
          </>
        }
      />
    </>
  );
}
