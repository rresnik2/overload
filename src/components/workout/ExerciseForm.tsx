"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { EQUIPMENT_LABEL, LOAD_TYPE_HELP, LOAD_TYPE_LABEL, MODALITY_LABEL, MUSCLE_LABEL, TRACKING_LABEL } from "@/components/exercises/labels";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import type { ExerciseCreate, ExerciseMuscleEntry, ExerciseRow } from "@/contracts/entities";
import { EQUIPMENT_VALUES, LOAD_TYPE_VALUES, MODALITY_VALUES, MUSCLE_VALUES, TRACKING_TYPE_VALUES, type Equipment, type LoadType, type Modality, type Muscle, type TrackingType } from "@/contracts/enums";
import { newId, slugify } from "@/lib/ids";
import { EXERCISE_CATEGORY_NOTE, MODALITY_DEFAULTS } from "./exercise-form-data";

interface Draft {
  name: string;
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking: TrackingType;
  isUnilateral: boolean;
  bodyweightFactor: string;
  mechanic: "" | "COMPOUND" | "ISOLATION";
  primary: Muscle[];
  secondary: Muscle[];
}

const EMPTY: Draft = { name: "", modality: "FREE_WEIGHT", ...MODALITY_DEFAULTS.FREE_WEIGHT, tracking: "LOAD_REPS", isUnilateral: false, bodyweightFactor: "", mechanic: "", primary: [], secondary: [] };

const draftOf = (e: ExerciseRow): Draft => ({
  name: e.name,
  modality: e.modality,
  equipment: e.equipment,
  loadType: e.loadType,
  tracking: e.tracking,
  isUnilateral: e.isUnilateral,
  bodyweightFactor: e.bodyweightFactor === null ? "" : String(e.bodyweightFactor),
  mechanic: e.mechanic ?? "",
  primary: e.muscles.filter((m) => m.role === "PRIMARY").map((m) => m.muscle),
  secondary: e.muscles.filter((m) => m.role === "SECONDARY").map((m) => m.muscle),
});

/** Create or edit a CUSTOM exercise (catalog exercises are read-only). The muscles travel inside the Exercise mutation. */
export function ExerciseForm({ id }: { id?: string }) {
  const existing = useLive(async () => (id ? ((await repo.exercises.get(id)) ?? null) : null), [id]);
  if (id && existing === undefined) return <p className="wk-muted" role="status">Loading exercise…</p>;
  if (id && existing === null) return <EmptyState title="Exercise not found" action={<Link href="/exercises" className="ui-btn ui-btn--ink">Back to exercises</Link>} />;
  if (id && existing && !existing.isCustom) {
    return <EmptyState title="Catalog exercises can't be edited" description="Only exercises you created yourself can be changed. Create your own version instead." action={<Link href="/exercises/new" className="ui-btn ui-btn--ink">New exercise</Link>} />;
  }
  return <ExerciseFormInner key={id ?? "new"} id={id} initial={existing ? draftOf(existing) : EMPTY} />;
}

function ExerciseFormInner({ id, initial }: { id?: string; initial: Draft }) {
  const router = useRouter();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const toggle = (role: "primary" | "secondary", muscle: Muscle) =>
    setDraft((d) => {
      const other = role === "primary" ? "secondary" : "primary";
      const has = d[role].includes(muscle);
      return { ...d, [role]: has ? d[role].filter((m) => m !== muscle) : [...d[role], muscle], [other]: d[other].filter((m) => m !== muscle) };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setErrors("Give the exercise a name.");
    if (draft.primary.length === 0) return setErrors("Pick at least one primary muscle.");
    const factor = draft.bodyweightFactor.trim() === "" ? null : Number(draft.bodyweightFactor.replace(",", "."));
    if (factor !== null && !(factor >= 0 && factor <= 2)) return setErrors("Bodyweight factor is a number from 0 to 2 (for example 0.65 for push-ups).");
    const muscles: ExerciseMuscleEntry[] = [...draft.primary.map((muscle) => ({ muscle, role: "PRIMARY" as const })), ...draft.secondary.map((muscle) => ({ muscle, role: "SECONDARY" as const }))];
    const fields: Omit<ExerciseCreate, "slug"> = {
      name: draft.name.trim(),
      modality: draft.modality,
      equipment: draft.equipment,
      loadType: draft.loadType,
      tracking: draft.tracking,
      isUnilateral: draft.isUnilateral,
      bodyweightFactor: draft.loadType === "BODYWEIGHT_PLUS" ? factor : null,
      mechanic: draft.mechanic || null,
      muscles,
    };
    setBusy(true);
    setErrors(null);
    try {
      if (id) await repo.exercises.update(id, fields);
      else await repo.exercises.create({ ...fields, slug: `${slugify(draft.name) || "exercise"}-${newId().slice(-6)}` });
      toast({ kind: "success", title: id ? "Exercise updated" : "Exercise created", description: draft.name.trim() });
      router.push("/exercises");
    } catch (err) {
      setErrors(err instanceof Error ? err.message : "Could not save the exercise.");
      setBusy(false);
    }
  };

  return (
    <form className="wk-form" onSubmit={submit} noValidate>
      <Field label="Name" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Cable woodchop" required />

      <label className="field">
        <span className="field__label">How is it loaded?</span>
        <select
          className="wk-select"
          value={draft.modality}
          onChange={(e) => {
            const modality = e.target.value as Modality;
            setDraft((d) => ({ ...d, modality, ...MODALITY_DEFAULTS[modality] }));
          }}
        >
          {MODALITY_VALUES.map((m) => (
            <option key={m} value={m}>
              {MODALITY_LABEL[m]}
            </option>
          ))}
        </select>
        <span className="field__hint">{EXERCISE_CATEGORY_NOTE[draft.modality]}</span>
      </label>

      <label className="field">
        <span className="field__label">Equipment</span>
        <select className="wk-select" value={draft.equipment} onChange={(e) => set("equipment", e.target.value as Equipment)}>
          {EQUIPMENT_VALUES.map((v) => (
            <option key={v} value={v}>
              {EQUIPMENT_LABEL[v]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">What the weight you log means</span>
        <select className="wk-select" value={draft.loadType} onChange={(e) => set("loadType", e.target.value as LoadType)}>
          {LOAD_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {LOAD_TYPE_LABEL[v]}
            </option>
          ))}
        </select>
        <span className="field__hint">{LOAD_TYPE_HELP[draft.loadType]}</span>
      </label>

      {draft.loadType === "BODYWEIGHT_PLUS" ? (
        <Field label="Share of bodyweight lifted (0 to 2)" kind="weight" value={draft.bodyweightFactor} onChange={(e) => set("bodyweightFactor", e.target.value)} hint="Leave empty for 1.0 (pull-ups, dips). Push-ups are about 0.65." />
      ) : null}

      <label className="field">
        <span className="field__label">What you track</span>
        <select className="wk-select" value={draft.tracking} onChange={(e) => set("tracking", e.target.value as TrackingType)}>
          {TRACKING_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {TRACKING_LABEL[v]}
            </option>
          ))}
        </select>
      </label>

      <label className="wk-check">
        <input type="checkbox" checked={draft.isUnilateral} onChange={(e) => set("isUnilateral", e.target.checked)} />
        <span>One side at a time (a single dumbbell counts once)</span>
      </label>

      <label className="field">
        <span className="field__label">Movement type (optional)</span>
        <select className="wk-select" value={draft.mechanic} onChange={(e) => set("mechanic", e.target.value as Draft["mechanic"])}>
          <option value="">Not set</option>
          <option value="COMPOUND">Compound</option>
          <option value="ISOLATION">Isolation</option>
        </select>
      </label>

      <fieldset className="wk-checks">
        <legend className="field__label">Primary muscles (count 1.0 set each)</legend>
        {MUSCLE_VALUES.map((m) => (
          <label key={m} className="wk-check">
            <input type="checkbox" checked={draft.primary.includes(m)} onChange={() => toggle("primary", m)} />
            <span>{MUSCLE_LABEL[m]}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="wk-checks">
        <legend className="field__label">Secondary muscles (count 0.5 set each)</legend>
        {MUSCLE_VALUES.map((m) => (
          <label key={m} className="wk-check">
            <input type="checkbox" checked={draft.secondary.includes(m)} onChange={() => toggle("secondary", m)} aria-label={`${MUSCLE_LABEL[m]} (secondary)`} />
            <span>{MUSCLE_LABEL[m]}</span>
          </label>
        ))}
      </fieldset>

      {errors ? (
        <p className="field__error" role="alert">
          {errors}
        </p>
      ) : null}
      <div className="wk-form__actions">
        <Button type="submit" loading={busy}>
          {id ? "Save exercise" : "Create exercise"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/exercises")}>
          Cancel
        </Button>
        {id ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete exercise
          </Button>
        ) : null}
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this exercise?"
        description="Sets you already logged keep their numbers; the exercise just disappears from the picker."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (id) await repo.exercises.remove(id);
                router.push("/exercises");
              }}
            >
              Delete exercise
            </Button>
          </>
        }
      />
    </form>
  );
}
