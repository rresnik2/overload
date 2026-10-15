"use client";
import { ArrowDown, ArrowUp, Link2, Link2Off, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { ModalityBadge } from "@/components/exercises/ModalityBadge";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { InfoHint } from "@/components/ui/InfoHint";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Term } from "@/components/ui/Term";
import { ExercisePicker } from "@/components/workout/ExercisePicker";
import { useWorkoutPrefs } from "@/components/workout/prefs";
import { movedPosition, supersetLabels, supersetPatches, templatePositionAfter } from "@/components/workout/session";
import { missingExercise } from "@/components/workout/view";
import type { TemplateExercisePatch, TemplateExerciseRow } from "@/contracts/entities";

/** Edit one template: name, folder, and per-exercise targets (sets, reps, RIR, rest, machine). Everything through `repo`. */
export function TemplateEditor({ id }: { id: string }) {
  const prefs = useWorkoutPrefs();
  const router = useRouter();
  const data = useLive(async () => {
    const template = await repo.templates.get(id);
    if (!template) return { template: null, lines: [] };
    const lines = [];
    for (const te of await repo.templates.exercisesOf(id)) {
      const exercise = (await repo.exercises.get(te.exerciseId)) ?? missingExercise(te.exerciseId);
      const machines = exercise.modality === "MACHINE" || exercise.modality === "CABLE" ? (await repo.machineProfiles.list()).filter((m) => m.exerciseId === exercise.id || m.exerciseId === null) : [];
      lines.push({ te, exercise, machines });
    }
    return { template, lines };
  }, [id]);
  const [name, setName] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!data) return <p className="wk-muted" role="status">Loading template…</p>;
  if (!data.template) return <EmptyState title="Template not found" description="It may have been deleted on another device." action={<Link href="/templates" className="ui-btn ui-btn--ink">Back to templates</Link>} />;
  const { template, lines } = data;
  const labels = supersetLabels(lines.map((l) => l.te));
  const patchLine = (te: TemplateExerciseRow, patch: TemplateExercisePatch) => void repo.templateExercises.update(te.id, patch);

  return (
    <div className="wk-active">
      <div className="wk-form">
        <Field
          label="Template name"
          value={name ?? template.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = (name ?? template.name).trim();
            setName(null);
            if (next && next !== template.name) void repo.templates.update(template.id, { name: next });
          }}
        />
        <Field
          label="Folder (optional)"
          value={folder ?? template.folder ?? ""}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() => {
            const next = (folder ?? template.folder ?? "").trim() || null;
            setFolder(null);
            if (next !== template.folder) void repo.templates.update(template.id, { folder: next });
          }}
        />
      </div>

      {lines.length === 0 ? (
        <EmptyState title="No exercises yet" description="Add the exercises you want in this workout." action={<Button onClick={() => setPicking(true)}>Add exercise</Button>} />
      ) : (
        lines.map(({ te, exercise, machines }, i) => (
          <section key={te.id} className="wk-te" aria-label={exercise.name}>
            {labels.get(te.id) ? (
              <p className="wk-exercise__superset">
                <Term id="superset">Superset {labels.get(te.id)}</Term>
              </p>
            ) : null}
            <div className="wk-card__head">
              <div>
                <h2 className="wk-card__title">{exercise.name}</h2>
                <ModalityBadge modality={exercise.modality} equipment={exercise.equipment} />
              </div>
              <div className="wk-card__actions">
                <button type="button" className="wk-icon-btn" aria-label={`Move ${exercise.name} up`} disabled={i === 0} onClick={() => { const p = movedPosition(lines.map((l) => l.te), te.id, "up"); if (p) patchLine(te, { position: p }); }}>
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
                <button type="button" className="wk-icon-btn" aria-label={`Move ${exercise.name} down`} disabled={i === lines.length - 1} onClick={() => { const p = movedPosition(lines.map((l) => l.te), te.id, "down"); if (p) patchLine(te, { position: p }); }}>
                  <ArrowDown size={18} aria-hidden="true" />
                </button>
                {labels.get(te.id) ? (
                  <button type="button" className="wk-icon-btn" aria-label={`Leave superset: ${exercise.name}`} onClick={() => void repo.transact(async (tx) => { for (const p of supersetPatches(lines.map((l) => l.te), te.id, "unlink")) await tx.templateExercises.update(p.id, { supersetKey: p.supersetKey }); })}>
                    <Link2Off size={18} aria-hidden="true" />
                  </button>
                ) : i < lines.length - 1 ? (
                  <button type="button" className="wk-icon-btn" aria-label={`Superset ${exercise.name} with next`} onClick={() => void repo.transact(async (tx) => { for (const p of supersetPatches(lines.map((l) => l.te), te.id, "link-next")) await tx.templateExercises.update(p.id, { supersetKey: p.supersetKey }); })}>
                    <Link2 size={18} aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" className="wk-icon-btn" aria-label={`Remove ${exercise.name}`} onClick={() => void repo.templateExercises.remove(te.id)}>
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="wk-te__grid">
              <NumberStepper label="Warm-up sets" labelHint="warmupSet" kind="reps" step={1} max={50} value={te.warmupSets} onChange={(v) => patchLine(te, { warmupSets: v ?? 0 })} />
              <NumberStepper label="Working sets" labelHint="workingSet" kind="reps" step={1} max={50} value={te.workingSets} onChange={(v) => patchLine(te, { workingSets: v ?? 0 })} />
              <NumberStepper label="Reps from" labelHint="repRange" kind="reps" step={1} min={1} max={200} value={te.repMin} onChange={(v) => patchLine(te, { repMin: v })} />
              <NumberStepper label="Reps to" kind="reps" step={1} min={1} max={200} value={te.repMax} onChange={(v) => patchLine(te, { repMax: v })} />
              <NumberStepper label={prefs.effortScale === "RPE" ? "Target RPE" : "Target RIR"} labelHint={prefs.effortScale === "RPE" ? "rpe" : "targetRir"} kind="reps" step={1} max={10} value={prefs.effortScale === "RPE" && te.targetRir != null ? 10 - te.targetRir : te.targetRir} onChange={(v) => patchLine(te, { targetRir: v === null ? null : prefs.effortScale === "RPE" ? 10 - v : v })} />
              <NumberStepper label="Rest (seconds)" labelHint="restSeconds" kind="reps" step={15} max={3600} value={te.restSec} onChange={(v) => patchLine(te, { restSec: v })} hint={te.restSec === null ? `Default ${prefs.defaultRestSec} s` : undefined} />
            </div>
            {machines.length > 0 || exercise.modality === "MACHINE" || exercise.modality === "CABLE" ? (
              <div className="field">
                <div className="field__label-row">
                  <label htmlFor={`machine-${te.id}`} className="field__label">
                    Machine
                  </label>
                  <InfoHint term="machineProfile" />
                </div>
                <select
                  id={`machine-${te.id}`} className="wk-select" value={te.machineProfileId ?? ""} onChange={(e) => patchLine(te, { machineProfileId: e.target.value || null })}>
                  <option value="">Ask when I start</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.gymName ? ` · ${m.gymName}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </section>
        ))
      )}

      <div className="wk-card__actions">
        {lines.length > 0 ? (
          <Button variant="ink" icon={<Plus size={18} />} onClick={() => setPicking(true)}>
            Add exercise
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => router.push("/templates")}>
          Done
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Delete template
        </Button>
      </div>
      {confirmDelete ? (
        <p role="alert" className="wk-card__actions">
          Delete &quot;{template.name}&quot;?
          <Button
            variant="danger"
            onClick={async () => {
              await repo.templates.remove(template.id);
              router.push("/templates");
            }}
          >
            Yes, delete
          </Button>
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
        </p>
      ) : null}

      {picking ? (
        <ExercisePicker
          open
          onClose={() => setPicking(false)}
          unit={prefs.unit}
          onPick={async (exercise, machine) => {
            const existing = await repo.templates.exercisesOf(template.id);
            await repo.templateExercises.create({
              templateId: template.id,
              exerciseId: exercise.id,
              machineProfileId: machine?.id ?? null,
              position: templatePositionAfter(existing),
              workingSets: 3,
              warmupSets: 0,
            });
          }}
        />
      ) : null}
    </div>
  );
}
