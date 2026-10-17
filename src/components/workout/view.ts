// The read model of one workout for the logging and history screens: exercises with their sets, machine, "last time" and PRs.
import type { ExerciseRow, LocalDateString, MachineProfileRow, WorkoutExerciseRow, WorkoutRow, WorkoutSetRow } from "@/contracts/entities";
import type { WeightUnit } from "@/contracts/enums";
import type { LastTimeEntry, Repo } from "@/contracts/repo";
import type { PrCandidate } from "@/contracts/prs";
import { isGearEquipment, type GearEquipment } from "@/client/repo/gear";
import { seriesKey } from "@/lib/ids";
import { isBarProfileExercise } from "./dial-setup";
import { workoutPrs } from "./prs";

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

/** An exercise of a workout without its sets, "last time" or records: what changes only when the exercise, its machine or its gear does. */
export type ExerciseStructure = Omit<ExerciseView, "sets" | "last">;

export interface WorkoutStructure {
  workout: WorkoutRow;
  exercises: ExerciseStructure[];
}

/** The workout and its exercises with their machine, bar profile and gear. No sets: a set write never touches these tables. */
export async function loadWorkoutStructure(repo: Repo, workoutId: string): Promise<WorkoutStructure | null> {
  const workout = await repo.workouts.get(workoutId);
  if (!workout) return null;
  const exercises: ExerciseStructure[] = [];
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
    exercises.push({ we, exercise, machine, barProfile, gear });
  }
  return { workout, exercises };
}

/** Every live set of the workout, by workout exercise (position order inside each). One read, and it only reacts to this workout's sets. */
export async function loadWorkoutSets(repo: Repo, workoutId: string): Promise<Map<string, WorkoutSetRow[]>> {
  const out = new Map<string, WorkoutSetRow[]>();
  for (const set of await repo.sets.forWorkout(workoutId)) {
    const list = out.get(set.workoutExerciseId);
    if (list) list.push(set);
    else out.set(set.workoutExerciseId, [set]);
  }
  return out;
}

/** The progression series (exercise, or exercise + machine) of a workout exercise. */
export const seriesOf = (we: Pick<WorkoutExerciseRow, "exerciseId" | "machineProfileId">): string => seriesKey(we.exerciseId, we.machineProfileId);

/**
 * What the screen knows about the past, per progression series: the previous session ("last time", before the workout's own date) and
 * every set of the series in OTHER workouts (the history that personal records are measured against). Neither changes when a set of
 * the current workout is written, so the active workout loads this once and again only after a sync or a new exercise.
 */
export interface SeriesContext {
  last: Map<string, LastTimeEntry | undefined>;
  history: Map<string, WorkoutSetRow[]>;
}

export async function loadSeriesContext(repo: Repo, workout: Pick<WorkoutRow, "id" | "localDate">, wes: readonly Pick<WorkoutExerciseRow, "exerciseId" | "machineProfileId">[], opts: { withLast?: boolean } = {}): Promise<SeriesContext> {
  const unique = new Map(wes.map((we) => [seriesOf(we), we] as const));
  const entries = await Promise.all(
    [...unique].map(async ([key, we]) => {
      const [last, all] = await Promise.all([
        opts.withLast === false ? undefined : repo.sets.lastTime({ exerciseId: we.exerciseId, machineProfileId: we.machineProfileId, beforeLocalDate: workout.localDate }),
        repo.sets.forSeries(key),
      ]);
      return [key, last, all.filter((s) => s.workoutId !== workout.id)] as const;
    }),
  );
  return { last: new Map(entries.map(([key, last]) => [key, last])), history: new Map(entries.map(([key, , history]) => [key, history])) };
}

/** Structure + sets + "last time" as the exercise views the blocks render. */
export function composeExercises(structure: readonly ExerciseStructure[], sets: ReadonlyMap<string, WorkoutSetRow[]>, last: ReadonlyMap<string, LastTimeEntry | undefined>): ExerciseView[] {
  return structure.map((s) => ({ ...s, sets: sets.get(s.we.id) ?? NO_SETS, last: last.get(seriesOf(s.we)) }));
}
const NO_SETS: WorkoutSetRow[] = [];

/** setId -> the records that set broke, split by workout exercise (a block only needs its own sets). */
export function workoutPrsByExercise(exercises: readonly ExerciseView[], history: ReadonlyMap<string, WorkoutSetRow[]>, workoutId: string): Map<string, Map<string, PrCandidate[]>> {
  const allSets: WorkoutSetRow[] = [];
  for (const e of exercises) allSets.push(...e.sets);
  for (const key of new Set(exercises.map((e) => seriesOf(e.we)))) allSets.push(...(history.get(key) ?? []));
  const all = workoutPrs(allSets, workoutId);
  const out = new Map<string, Map<string, PrCandidate[]>>();
  for (const e of exercises) {
    const own = new Map<string, PrCandidate[]>();
    for (const set of e.sets) {
      const prs = all.get(set.id);
      if (prs) own.set(set.id, prs);
    }
    out.set(e.we.id, own);
  }
  return out;
}

/** One read of everything, for screens that do not edit live (history). The active workout composes the same pieces from separate live queries. */
export async function loadWorkoutView(repo: Repo, workoutId: string, opts: { withLast?: boolean } = {}): Promise<WorkoutView | null> {
  const structure = await loadWorkoutStructure(repo, workoutId);
  if (!structure) return null;
  const sets = await loadWorkoutSets(repo, workoutId);
  const context = await loadSeriesContext(repo, structure.workout, structure.exercises.map((e) => e.we), opts);
  const exercises = composeExercises(structure.exercises, sets, context.last);
  const byExercise = workoutPrsByExercise(exercises, context.history, workoutId);
  const prs = new Map<string, PrCandidate[]>();
  for (const own of byExercise.values()) for (const [id, list] of own) prs.set(id, list);
  return { workout: structure.workout, exercises, prs };
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
  /** One per PR set, in workout order, with what the PR moment draws: the exercise, the weight and its unit, and the reps. */
  prs: {
    setId: string;
    exerciseName: string;
    headline: PrCandidate;
    exercise: Pick<ExerciseRow, "name" | "equipment" | "loadType" | "isUnilateral">;
    weightKg: number | null;
    inputUnit: WeightUnit | null;
    reps: number | null;
  }[];
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
      if (pr) prs.push({ setId: set.id, exerciseName: item.exercise.name, headline: pr, exercise: item.exercise, weightKg: set.weightKg, inputUnit: set.inputUnit, reps: set.reps });
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
