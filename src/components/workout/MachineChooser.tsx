"use client";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { Button } from "@/components/ui/Button";
import type { ExerciseRow, MachineProfileRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import { MachineProfileForm } from "./MachineProfileForm";

export interface MachineChooserProps {
  exercise: ExerciseRow;
  unit: WeightUnit;
  /** Called with the chosen (or newly created) profile. */
  onChoose: (profile: MachineProfileRow) => void;
  onBack?: () => void;
  confirmLabel?: string;
}

/**
 * Machine and cable exercises are tracked per machine: a pin-loaded press at one gym is not the one at another, so each profile
 * is its own progression series. Defaults to the profile used last for this exercise. Never offers to convert between machines.
 */
export function MachineChooser({ exercise, unit, onChoose, onBack, confirmLabel = "Add exercise" }: MachineChooserProps) {
  const data = useLive(async () => {
    const all = await repo.machineProfiles.list();
    const linked = all.filter((p) => p.exerciseId === exercise.id);
    const free = all.filter((p) => p.exerciseId === null);
    const last = (await repo.machineProfiles.lastUsedFor(exercise.id)) ?? null;
    return { profiles: [...linked, ...free], last };
  }, [exercise.id]);
  const [picked, setPicked] = useState<string | null>(null);
  const [wantsNew, setWantsNew] = useState(false);

  if (!data) return <p className="wk-muted">Loading machines…</p>;
  // Default selection: the machine used last for this exercise, or the only one there is.
  const initial = data.last ?? (data.profiles.length === 1 ? data.profiles[0] : undefined);
  const selected = picked ?? initial?.id ?? null;
  const chosen = data.profiles.find((p) => p.id === selected);
  const creating = wantsNew || data.profiles.length === 0;

  if (creating) {
    return (
      <div className="wk-machine">
        <h3 className="wk-machine__title">New machine for {exercise.name}</h3>
        <MachineProfileForm
          unit={unit}
          exerciseId={exercise.id}
          submitLabel="Save and add"
          onCancel={data.profiles.length > 0 ? () => setWantsNew(false) : onBack}
          onSave={async (fields) => {
            onChoose(await repo.machineProfiles.create(fields));
          }}
        />
      </div>
    );
  }

  return (
    <div className="wk-machine">
      <h3 className="wk-machine__title">Which machine?</h3>
      <p className="wk-muted">{exercise.name}: each machine keeps its own progress.</p>
      <ul className="wk-machine__list" role="radiogroup" aria-label="Machine">
        {data.profiles.map((profile) => (
          <li key={profile.id}>
            <label className="wk-machine__option">
              <input type="radio" name="machine" checked={selected === profile.id} onChange={() => setPicked(profile.id)} />
              <span>
                <strong>{profile.name}</strong>
                <span className="wk-muted">{[profile.gymName, profile.brand, data.last?.id === profile.id ? "last used" : null].filter(Boolean).join(" · ")}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="wk-form__actions">
        <Button disabled={!chosen} onClick={() => chosen && onChoose(chosen)}>
          {confirmLabel}
        </Button>
        <Button variant="ink" onClick={() => setWantsNew(true)}>
          New machine
        </Button>
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
