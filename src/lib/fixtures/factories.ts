// Tiny builders for hand-made analytics inputs in tests (and quick experiments). Pure; ids are deterministic per call order.
import type { AnalyticsInput, ExerciseMeta, ProfileFact, SetFact } from "@/contracts/analytics";
import { addDays } from "@/lib/dates";
import { estimate1RM } from "@/lib/analytics/e1rm";
import { seriesKey } from "@/lib/ids";
import { FIXTURE_EXERCISES } from "./exercises";

let counter = 0;

export interface SetOpts extends Partial<SetFact> {
  /** Convenience: sets weightKg and effectiveLoadKg together. */
  load?: number;
}

/** A completed working set. e1rmKg is derived from load/reps/rir unless given. */
export function makeSet(opts: SetOpts = {}): SetFact {
  counter += 1;
  const { load, ...rest } = opts;
  const exerciseId = rest.exerciseId ?? FIXTURE_EXERCISES.squat.meta.id;
  const machineProfileId = rest.machineProfileId ?? null;
  const localDate = rest.localDate ?? "2026-10-05";
  const weight = rest.weightKg !== undefined ? rest.weightKg : (load ?? 100);
  const eff = rest.effectiveLoadKg !== undefined ? rest.effectiveLoadKg : (load ?? weight);
  const reps = rest.reps !== undefined ? rest.reps : 5;
  const rir = rest.rir !== undefined ? rest.rir : 2;
  const e1 = rest.e1rmKg !== undefined ? rest.e1rmKg : eff != null && reps != null ? (estimate1RM({ weightKg: eff, reps, rir })?.e1rmKg ?? null) : null;
  return {
    id: `set-${counter}`,
    workoutId: `workout-${localDate}`,
    exerciseId,
    machineProfileId,
    seriesKey: seriesKey(exerciseId, machineProfileId),
    localDate,
    completedAt: `${localDate}T18:${String(counter % 60).padStart(2, "0")}:00.000Z`,
    setType: "WORKING",
    durationSec: null,
    distanceM: null,
    isDeload: false,
    workoutBodyweightKg: null,
    ...rest,
    weightKg: weight,
    effectiveLoadKg: eff,
    reps,
    rir,
    e1rmKg: e1,
  };
}

export function makeProfile(over: Partial<ProfileFact> = {}): ProfileFact {
  return {
    sex: "MALE", birthDate: "1996-04-12", ageYears: 30, heightCm: 180, experience: "INTERMEDIATE", goal: "HYPERTROPHY",
    e1rmFormula: "EPLEY", unitPreference: "KG", timezone: "UTC", ...over,
  };
}

export function makeInput(over: Partial<AnalyticsInput> = {}): AnalyticsInput {
  const exercises: ExerciseMeta[] = Object.values(FIXTURE_EXERCISES).map((e) => e.meta);
  return { today: "2026-10-12", profile: makeProfile(), exercises, machineProfiles: [], sets: [], bodyMetrics: [], ...over };
}

/** `n` sessions of one series, `everyDays` apart ending at `endDate`, with the e1RM given by `e1rm(i)` (one set of 5 reps, RIR 0). */
export function sessionsOf(
  exerciseId: string,
  n: number,
  e1rm: (i: number) => number,
  opts: { endDate?: string; everyDays?: number; machineProfileId?: string | null; deload?: (i: number) => boolean } = {},
): SetFact[] {
  const end = opts.endDate ?? "2026-10-11";
  const step = opts.everyDays ?? 7;
  return Array.from({ length: n }, (_, i) => {
    const load = e1rm(i) / (1 + 5 / 30);
    return makeSet({
      exerciseId,
      machineProfileId: opts.machineProfileId ?? null,
      localDate: addDays(end, -step * (n - 1 - i)),
      load: Math.round(load * 1000) / 1000,
      reps: 5,
      rir: 0,
      isDeload: opts.deload?.(i) ?? false,
    });
  });
}
