// The read model of one workout for the logging and history screens: exercises with their sets, machine, "last time" and PRs.
import type { ExerciseRow, LocalDateString, MachineProfileRow, WorkoutExerciseRow, WorkoutRow, WorkoutSetRow } from "@/contracts/entities";
import type { LastTimeEntry, Repo } from "@/contracts/repo";
import type { PrCandidate } from "@/contracts/prs";
import { isGearEquipment, type GearEquipment } from "@/lib/gear";
import { isBarProfileExercise } from "./dial-setup";
import { seriesHistory, workoutPrs } from "./prs";

export interface ExerciseView {
  we: WorkoutExerciseRow;
  exercise: ExerciseRow;
  machine: MachineProfileRow | null;
  /** The lifter's "bar and plates" profile for a barbell, EZ bar or trap bar exercise (D1, D6): a MachineProfile linked by exerciseId. */
  barProfile?: MachineProfileRow | null;
  /**
   * The user's gear profile for a DUMBBELL or KETTLEBELL exercise: their dumbbell step or the kettlebells they own. Null until
   * they set it (the dial then uses the defaults). Loaded once per workout view, shared by every exercise of that equipment.
   */
  gear?: MachineProfileRow | null;
  sets: WorkoutSetRow[];
  /** The previous session of the same progression series (exercise, or exercise + machine). */
  last: LastTimeEntry | undefined;
}

export interface WorkoutView {
  workout: WorkoutRow;
  exercises: ExerciseView[];
  /** setId -> records that set broke. */
  prs: Map<string, PrCandidate[]>;
}

/** Stand-in for an exercise that was deleted after it was logged (history keeps the sets). */
export function missingExercise(id: string): ExerciseRow {
  const now = new Date(0).toISOString();
  return {
    id,
    slug: "deleted",
    name: "Deleted exercise",
    aliases: [],
    modality: "OTHER",
    equipment: "OTHER",
    loadType: "TOTAL",
    tracking: "LOAD_REPS",
    bodyweightFactor: null,
    isUnilateral: false,
    mechanic: null,
    force: null,
    level: null,
    category: "STRENGTH",
    standardLift: null,
    instructions: [],
    images: [],
    muscles: [],
    isCustom: true,
    sourceId: null,
    hlc: "",
    fieldHlc: {},
    version: 0,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** One live-query-friendly read (sequential awaits only). Null when the workout does not exist (or was deleted). */
export async function loadWorkoutView(repo: Repo, workoutId: string, opts: { withLast?: boolean } = {}): Promise<WorkoutView | null> {
  const workout = await repo.workouts.get(workoutId);
  if (!workout) return null;
  const exercises: ExerciseView[] = [];
  const gearCache = new Map<GearEquipment, MachineProfileRow | null>();
  const gearFor = async (equipment: GearEquipment): Promise<MachineProfileRow | null> => {
    if (!gearCache.has(equipment)) gearCache.set(equipment, (await repo.machineProfiles.gear(equipment)) ?? null);
    return gearCache.get(equipment) ?? null;
  };
  for (const we of await repo.workoutExercises.forWorkout(workoutId)) {
    const exercise = (await repo.exercises.get(we.exerciseId)) ?? missingExercise(we.exerciseId);
    const machine = we.machineProfileId ? ((await repo.machineProfiles.get(we.machineProfileId)) ?? null) : null;
    const barProfile = !machine && isBarProfileExercise(exercise) ? ((await repo.machineProfiles.forExercise(exercise.id))[0] ?? null) : null;
    const gear = isGearEquipment(exercise.equipment) ? await gearFor(exercise.equipment) : null;
    const sets = await repo.sets.forWorkoutExercise(we.id);
    const last = opts.withLast === false ? undefined : await repo.sets.lastTime({ exerciseId: we.exerciseId, machineProfileId: we.machineProfileId, beforeLocalDate: workout.localDate });
    exercises.push({ we, exercise, machine, barProfile, gear, sets, last });
  }
  const sets = exercises.flatMap((e) => e.sets);
  const prs = sets.length > 0 ? workoutPrs(await seriesHistory(sets.map((s) => s.seriesKey)), workoutId) : new Map<string, PrCandidate[]>();
  return { workout, exercises, prs };
}

export interface WorkoutSummary {
  durationMs: number;
  exercises: number;
  /** Completed sets that are not warm-ups. */
  sets: number;
  warmupSets: number;
  /** Planned sets that will be dropped when the workout is finished. */
  unfinishedSets: number;
  /** sum of effective load x reps over completed non-warm-up sets (kg). */
  volumeKg: number;
  prSets: number;
  prs: { setId: string; exerciseName: string; headline: PrCandidate }[];
}

export function summarizeWorkout(view: WorkoutView, endedAtMs: number, headline: (c: PrCandidate[]) => PrCandidate | undefined): WorkoutSummary {
  let sets = 0;
  let warmupSets = 0;
  let unfinished = 0;
  let volume = 0;
  let withSets = 0;
  const prs: WorkoutSummary["prs"] = [];
  for (const item of view.exercises) {
    let done = 0;
    for (const set of item.sets) {
      if (set.completedAt == null) {
        unfinished += 1;
        continue;
      }
      done += 1;
      if (set.setType === "WARMUP") {
        warmupSets += 1;
        continue;
      }
      sets += 1;
      if (set.effectiveLoadKg != null && set.reps != null) volume += set.effectiveLoadKg * set.reps;
      const pr = headline(view.prs.get(set.id) ?? []);
      if (pr) prs.push({ setId: set.id, exerciseName: item.exercise.name, headline: pr });
    }
    if (done > 0) withSets += 1;
  }
  return {
    durationMs: Math.max(0, endedAtMs - new Date(view.workout.startedAt).getTime()),
    exercises: withSets,
    sets,
    warmupSets,
    unfinishedSets: unfinished,
    volumeKg: Math.round(volume * 100) / 100,
    prSets: prs.length,
    prs,
  };
}

export function workoutDateLabel(localDate: LocalDateString, locale?: string): string {
  const [y, m, d] = localDate.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}
