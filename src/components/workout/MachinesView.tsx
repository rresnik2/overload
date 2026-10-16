"use client";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import { Button } from "@/components/ui/Button";
import { Modal, Sheet } from "@/components/ui/Sheet";
import type { ExerciseRow, MachineProfileRow } from "@/contracts/entities";
import { formatWeight } from "@/lib/units";
import { isBarProfileExercise } from "./dial-setup";
import { MachineProfileForm } from "./MachineProfileForm";
import { useWorkoutPrefs } from "./prefs";

/**
 * Settings > Machines: name, gym, brand, label unit, pin step, base load and the linked exercise, and the bar and plates profiles
 * of barbell exercises (bar weight, plates owned). Reads and writes through `repo`.
 */
export function MachinesView() {
  const prefs = useWorkoutPrefs();
  const data = useLive(async () => {
    const profiles = (await repo.machineProfiles.list()).sort((a, b) => a.name.localeCompare(b.name));
    const exercises = new Map<string, Pick<ExerciseRow, "name" | "equipment" | "loadType">>();
    for (const p of profiles) {
      if (!p.exerciseId) continue;
      const ex = await repo.exercises.get(p.exerciseId);
      exercises.set(p.exerciseId, ex ? { name: ex.name, equipment: ex.equipment, loadType: ex.loadType } : { name: "Deleted exercise", equipment: "OTHER", loadType: "TOTAL" });
    }
    return { profiles, exercises };
  });
  const [editing, setEditing] = useState<MachineProfileRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<MachineProfileRow | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const options = useLive(
    async () => [...(await repo.exercises.search({ modality: "MACHINE", text: filter || undefined, limit: 40 })), ...(await repo.exercises.search({ modality: "CABLE", text: filter || undefined, limit: 40 }))],
    [filter],
  );

  const open = (target: MachineProfileRow | "new") => {
    setLinked(target === "new" ? null : target.exerciseId);
    setFilter("");
    setEditing(target);
  };

  if (!data) return <p className="wk-muted" role="status">Loading machines…</p>;
  const { profiles, exercises } = data;
  const barOf = (p: MachineProfileRow | "new") => {
    const ex = p === "new" || !p.exerciseId ? undefined : exercises.get(p.exerciseId);
    return ex !== undefined && isBarProfileExercise(ex);
  };
  const editingBar = editing !== null && barOf(editing);
  const linkedEquipment = (linked ? (options?.find((o) => o.id === linked)?.equipment ?? exercises.get(linked)?.equipment) : undefined) ?? null;

  return (
    <>
      <div className="wk-card__actions">
        <Button icon={<Plus size={18} />} onClick={() => open("new")}>
          Add machine
        </Button>
      </div>
      {profiles.length === 0 ? (
        <EmptyState title="No machines yet" description="A machine profile keeps one gym's pin-loaded or plate-loaded machine apart from every other, so progress on it is never mixed up. You can also add one while logging." />
      ) : (
        <ul className="wk-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <HardCard as="article" className="wk-card">
                <div className="wk-card__head">
                  <div>
                    <h2 className="wk-card__title">{p.name}</h2>
                    <p className="wk-muted">{barOf(p) ? "Bar and plates" : [p.gymName, p.brand].filter(Boolean).join(" · ") || "No gym or brand"}</p>
                  </div>
                  <button type="button" className="wk-icon-btn" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
                <p className="wk-stats num">
                  <span>Label unit {p.labelUnit === "LB" ? "lb" : p.labelUnit === "KG" ? "kg" : `${prefs.unit === "LB" ? "lb" : "kg"} (default)`}</span>
                  {p.pinStepKg != null ? <span>Pin step {formatWeight(p.pinStepKg, p.labelUnit ?? prefs.unit)}</span> : null}
                  {p.baseLoadKg != null ? <span>{barOf(p) ? "Bar weight" : "Base load"} {formatWeight(p.baseLoadKg, p.labelUnit ?? prefs.unit)}</span> : null}
                  {p.platesKg && p.platesKg.length > 0 ? <span>Plates {p.platesKg.map((kg) => formatWeight(kg, p.labelUnit ?? prefs.unit, { withUnit: false })).join(", ")}</span> : null}
                </p>
                <p className="wk-muted">{p.exerciseId ? `For ${exercises.get(p.exerciseId)?.name ?? "an exercise"}` : "Not linked to an exercise"}</p>
                <div className="wk-card__actions">
                  <Button variant="ink" onClick={() => open(p)} aria-label={`Edit ${p.name}`}>
                    Edit
                  </Button>
                </div>
              </HardCard>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New machine" : editingBar ? "Edit bar and plates" : "Edit machine"}>
        {editing !== null ? (
          <MachineProfileForm
            key={editing === "new" ? "new" : editing.id}
            kind={editingBar ? "bar" : "machine"}
            plates={linkedEquipment === "MACHINE_PLATE_LOADED" || linkedEquipment === "SMITH_MACHINE"}
            initial={editing === "new" ? undefined : editing}
            unit={prefs.unit}
            linkedExerciseId={linked}
            onCancel={() => setEditing(null)}
            onSave={async (fields) => {
              if (editing === "new") await repo.machineProfiles.create(fields);
              else await repo.machineProfiles.update(editing.id, fields);
              setEditing(null);
            }}
            extra={
              editingBar ? null : (
              <fieldset className="field">
                <legend className="field__label">Linked exercise (optional)</legend>
                <input className="field__input" type="search" placeholder="Filter machine and cable exercises" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter exercises" />
                <select className="wk-select" value={linked ?? ""} onChange={(e) => setLinked(e.target.value || null)} aria-label="Linked exercise">
                  <option value="">Not linked</option>
                  {linked && !options?.some((o) => o.id === linked) ? <option value={linked}>{exercises.get(linked)?.name ?? "Linked exercise"}</option> : null}
                  {(options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </fieldset>
              )
            }
          />
        ) : null}
      </Sheet>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this machine?"
        description="Workouts already logged on it keep their numbers."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (deleting) await repo.machineProfiles.remove(deleting.id);
                setDeleting(null);
              }}
            >
              Delete machine
            </Button>
          </>
        }
      />
    </>
  );
}
