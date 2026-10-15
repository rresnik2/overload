"use client";
import Link from "next/link";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { ExerciseList } from "@/components/exercises/ExerciseList";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ModalityTabs, type ModalityTab } from "@/components/ui/Tabs";
import type { ExerciseRow, MachineProfileRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import { MachineChooser } from "./MachineChooser";

export interface ExercisePickerProps {
  open: boolean;
  onClose: () => void;
  unit: WeightUnit;
  /** Called with the exercise and, for machine/cable exercises, the chosen MachineProfile. */
  onPick: (exercise: ExerciseRow, machine: MachineProfileRow | null) => void | Promise<void>;
  title?: string;
}

const PAGE = 30;
const needsMachine = (e: ExerciseRow) => e.modality === "MACHINE" || e.modality === "CABLE";

/**
 * Exercise picker sheet: tabs by modality (Free weight / Machine / Cable / Bodyweight), search across everything, recent first.
 * Built on `repo.exercises.search` and the catalog's ExerciseList. Machine and cable picks continue to the machine chooser.
 */
export function ExercisePicker({ open, onClose, unit, onPick, title = "Add exercise" }: ExercisePickerProps) {
  const [tab, setTab] = useState<ModalityTab>("FREE_WEIGHT");
  const [text, setText] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [chosen, setChosen] = useState<ExerciseRow | null>(null);
  const query = text.trim();

  const results = useLive(
    () => repo.exercises.search({ text: query || undefined, modality: query ? undefined : tab, limit: limit + 1 }),
    [query, tab, limit],
  );
  const recent = useLive(() => repo.exercises.recent(6), []);
  const shown = results?.slice(0, limit);
  const more = (results?.length ?? 0) > limit;

  const pick = async (exercise: ExerciseRow, machine: MachineProfileRow | null) => {
    await onPick(exercise, machine);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={chosen ? "Choose machine" : title} className="wk-picker">
      {chosen ? (
        <MachineChooser exercise={chosen} unit={unit} onBack={() => setChosen(null)} onChoose={(machine) => void pick(chosen, machine)} />
      ) : (
        <div className="wk-picker__body">
          <label className="field">
            <span className="sr-only">Search exercises</span>
            <input
              className="field__input"
              type="search"
              placeholder="Search exercises"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setLimit(PAGE);
              }}
              enterKeyHint="search"
              autoComplete="off"
            />
          </label>
          {query ? <p className="wk-muted">Searching every modality.</p> : <ModalityTabs value={tab} onChange={(m) => { setTab(m); setLimit(PAGE); }} />}

          {!query && recent && recent.length > 0 ? (
            <section aria-label="Recent exercises">
              <h3 className="wk-picker__heading">Recent</h3>
              <PickList exercises={recent} onChoose={(e) => (needsMachine(e) ? setChosen(e) : void pick(e, null))} />
            </section>
          ) : null}

          <section aria-label="Exercises">
            {!query ? <h3 className="wk-picker__heading">All</h3> : null}
            {shown ? (
              <PickList
                exercises={shown}
                onChoose={(e) => (needsMachine(e) ? setChosen(e) : void pick(e, null))}
                empty={{ title: "No exercises match", description: "Try another search, or create your own exercise.", action: <Link href="/exercises/new" className="ui-btn ui-btn--ink">New exercise</Link> }}
              />
            ) : (
              <p className="wk-muted">Loading exercises…</p>
            )}
            {more ? (
              <Button variant="ink" block onClick={() => setLimit((n) => n + PAGE)}>
                Show more
              </Button>
            ) : null}
          </section>
          <p className="wk-muted">
            Not here? <Link href="/exercises/new">Create a custom exercise</Link>.
          </p>
        </div>
      )}
    </Sheet>
  );
}

function PickList({ exercises, onChoose, empty }: { exercises: ExerciseRow[]; onChoose: (e: ExerciseRow) => void; empty?: { title: string; description?: string; action?: React.ReactNode } }) {
  return (
    <ExerciseList
      exercises={exercises}
      showImages={false}
      empty={empty}
      actionsFor={(exercise) => (
        <Button variant="primary" onClick={() => onChoose(exercise)} aria-label={`Add ${exercise.name}`}>
          Add
        </Button>
      )}
    />
  );
}
