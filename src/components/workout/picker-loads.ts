// The exercise picker's last loads, read from the local database so the rows draw them offline too: the top set of the last
// session before today (repo.sets.lastTime, then topSet), in the unit it was entered in. Machine and cable exercises are tracked
// per machine, so each is looked up under every machine it can have been logged on, and the most recent session wins.
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { isMachineProfile } from "@/client/repo/gear";
import { topSet } from "@/components/today/next-up";
import type { ExerciseRow, MachineProfileRow } from "@/contracts/entities";
import type { LastLoad } from "@/lib/analytics/last-load";
import { toLocalDate, type LocalDate } from "@/lib/dates";

type PickerExercise = Pick<ExerciseRow, "id" | "modality">;

const tracksMachine = (e: Pick<ExerciseRow, "modality">) => e.modality === "MACHINE" || e.modality === "CABLE";

async function lastLoadOf(exercise: PickerExercise, machines: readonly MachineProfileRow[]): Promise<LastLoad | null> {
  const series: (MachineProfileRow | null)[] = [null];
  if (tracksMachine(exercise)) series.push(...machines.filter((m) => m.exerciseId === null || m.exerciseId === exercise.id));
  const entries = await Promise.all(series.map(async (machine) => ({ machine, last: await repo.sets.lastTime({ exerciseId: exercise.id, machineProfileId: machine?.id ?? null }) })));
  let best: (typeof entries)[number] | null = null;
  for (const e of entries) if (e.last && (!best?.last || e.last.localDate > best.last.localDate)) best = e;
  const top = best?.last ? topSet(best.last.sets) : null;
  if (!best?.last || !top) return null;
  return {
    exerciseId: exercise.id,
    localDate: best.last.localDate,
    weightKg: top.weightKg,
    reps: top.reps,
    pinStepKg: best.machine?.pinStepKg ?? null,
    inputUnit: top.inputUnit ?? best.machine?.labelUnit ?? null,
  };
}

interface Lookup {
  /** Every exercise id asked about, found or not. */
  looked: readonly string[];
  loads: ReadonlyMap<string, LastLoad>;
  /** Today on this device, for "yesterday" in the rows. */
  today: LocalDate;
}

/** Last loads by exercise id for `exercises` (and only those). */
export async function pickerLastLoads(exercises: readonly PickerExercise[]): Promise<Lookup> {
  const today = toLocalDate(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
  const unique = [...new Map(exercises.map((e) => [e.id, e])).values()];
  const machines = unique.some(tracksMachine) ? (await repo.machineProfiles.list()).filter(isMachineProfile) : [];
  const found = await Promise.all(unique.map((e) => lastLoadOf(e, machines)));
  const loads = new Map<string, LastLoad>();
  for (const load of found) if (load) loads.set(load.exerciseId, load);
  return { looked: unique.map((e) => e.id), loads, today };
}

interface Known {
  looked: ReadonlySet<string>;
  loads: ReadonlyMap<string, LastLoad>;
  today: LocalDate | null;
  /** The lookup merged last, so each answer is merged once. */
  from: Lookup | null;
}

const NOTHING: Known = { looked: new Set(), loads: new Map(), today: null, from: null };

/**
 * Last loads for the rows on screen. Each row is looked up once while the picker is open (the sets before today do not change
 * under it), so a search that narrows the list reads nothing and "Show more" reads only the new rows.
 */
export function usePickerLastLoads(exercises: readonly PickerExercise[]): { lastLoads: ReadonlyMap<string, LastLoad>; today: LocalDate | null } {
  const [known, setKnown] = useState<Known>(NOTHING);
  const missing = exercises.filter((e) => !known.looked.has(e.id));
  const key = [...new Set(missing.map((e) => e.id))].join(" ");
  const found = useLive(() => (key ? pickerLastLoads(missing) : null), [key]);
  if (found && found !== known.from) {
    const loads = new Map(known.loads);
    for (const id of found.looked) loads.delete(id);
    for (const [id, load] of found.loads) loads.set(id, load);
    setKnown({ looked: new Set([...known.looked, ...found.looked]), loads, today: found.today, from: found });
  }
  return { lastLoads: known.loads, today: known.today };
}
