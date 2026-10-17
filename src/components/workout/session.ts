// Workout session operations over the client `repo` (Dexie, offline-first). No React, no network: every write is a repo
// transaction (row + HLC + outbox), so each of these works with no signal and syncs later.
// Inside repo.transact only repo/tx calls are awaited (an IndexedDB transaction auto-commits across other awaits).
import { generateKeyBetween } from "fractional-indexing";
import type { ExerciseRow, MachineProfileRow, TemplateExerciseRow, TemplateRow, WorkoutExerciseRow, WorkoutRow, WorkoutSetPatch, WorkoutSetRow } from "@/contracts/entities";
import type { SetType, WeightUnit } from "@/contracts/enums";
import type { LastTimeEntry, Repo } from "@/contracts/repo";
import { toLocalDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import { defaultIncrement, fromKg, toKg } from "@/lib/units";
import { setFields } from "./labels";

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const keyAfter = (rows: { position: string }[]): string => generateKeyBetween(rows.length > 0 ? (rows[rows.length - 1] as { position: string }).position : null, null);

// ───────────────────────────── units and steps ─────────────────────────────

/** The unit a set row is entered and shown in: what it was typed in, else the machine's label unit, else the user's unit. */
export function unitForSet(set: Pick<WorkoutSetRow, "inputUnit"> | null, machine: Pick<MachineProfileRow, "labelUnit"> | null, preference: WeightUnit): WeightUnit {
  return set?.inputUnit ?? machine?.labelUnit ?? preference;
}

/**
 * Weight stepper increment (in the row's unit): a machine's pin step wins, then the user's dumbbell step (gear profile, dumbbell
 * exercises only), else the equipment default.
 */
export function weightStep(
  unit: WeightUnit,
  exercise: Pick<ExerciseRow, "equipment">,
  machine: Pick<MachineProfileRow, "pinStepKg"> | null,
  gear: Pick<MachineProfileRow, "pinStepKg"> | null = null,
): number {
  const gearStep = exercise.equipment === "DUMBBELL" ? (gear?.pinStepKg ?? null) : null;
  return defaultIncrement(unit, exercise.equipment, { pinStepKg: machine?.pinStepKg ?? gearStep });
}

/** Typed value (in `unit`) -> stored kg; the entry unit rides along as `inputUnit`. null clears the weight. */
export function weightPatch(value: number | null, unit: WeightUnit): Pick<WorkoutSetPatch, "weightKg" | "inputUnit"> {
  return { weightKg: value === null ? null : toKg(value, unit), inputUnit: unit };
}

/** Stored kg -> the number shown in `unit` (round trip of weightPatch: 135 lb stays 135). */
export function shownWeight(kg: number | null, unit: WeightUnit): number | null {
  return kg === null ? null : fromKg(kg, unit);
}

// ───────────────────────────── "last time" ghosts ─────────────────────────────

type GhostSource = Pick<WorkoutSetRow, "weightKg" | "reps" | "inputUnit" | "durationSec" | "distanceM"> & Partial<Pick<WorkoutSetRow, "rir">>;

/** The set of the previous session this one lines up with: the n-th warm-up for the n-th warm-up, the n-th other set for the rest. */
export function ghostSet(last: LastTimeEntry | undefined, sets: WorkoutSetRow[], set: WorkoutSetRow): GhostSource | null {
  if (!last) return null;
  const warm = set.setType === "WARMUP";
  const pool = last.sets.filter((s) => (s.setType === "WARMUP") === warm);
  const index = sets.filter((s) => (s.setType === "WARMUP") === warm).findIndex((s) => s.id === set.id);
  if (pool.length === 0 || index < 0) return null;
  return pool[Math.min(index, pool.length - 1)] ?? null;
}

// ───────────────────────────── starting a workout ─────────────────────────────

export interface StartWorkoutOptions {
  template?: TemplateRow | null;
  title?: string | null;
  unit: WeightUnit;
  now?: Date;
  timeZone?: string;
}

/** Start (or return the already active) workout. `localDate` and `timezone` come from the device. */
export async function startWorkout(repo: Repo, opts: StartWorkoutOptions): Promise<WorkoutRow> {
  const existing = await repo.workouts.active();
  if (existing) return existing;
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? deviceTimeZone();
  return repo.transact(async (tx) => {
    const latest = await tx.bodyMetrics.latest();
    const workout = await tx.workouts.create({
      templateId: opts.template?.id ?? null,
      title: opts.title ?? opts.template?.name ?? null,
      startedAt: now.toISOString(),
      localDate: toLocalDate(now, timeZone),
      timezone: timeZone,
      bodyweightKg: latest?.weightKg ?? null,
    });
    if (opts.template) {
      for (const te of await tx.templates.exercisesOf(opts.template.id)) {
        const exercise = await tx.exercises.get(te.exerciseId);
        if (!exercise) continue;
        await addExerciseToWorkout(tx, { workoutId: workout.id, exercise, machineProfileId: te.machineProfileId, unit: opts.unit, from: te });
      }
    }
    return workout;
  });
}

export interface AddExerciseInput {
  workoutId: string;
  exercise: ExerciseRow;
  machineProfileId: string | null;
  unit: WeightUnit;
  /** A template line to copy (position, set counts, rest, superset). */
  from?: TemplateExerciseRow;
}

/** Add an exercise (and its planned sets, prefilled from the last session of the same series) to a workout. */
export async function addExerciseToWorkout(repo: Repo, input: AddExerciseInput): Promise<WorkoutExerciseRow> {
  return repo.transact(async (tx) => {
    const workout = await tx.workouts.get(input.workoutId);
    if (!workout) throw new Error("addExerciseToWorkout: the workout no longer exists");
    const existing = await tx.workoutExercises.forWorkout(input.workoutId);
    const we = await tx.workoutExercises.create({
      workoutId: input.workoutId,
      exerciseId: input.exercise.id,
      machineProfileId: input.machineProfileId,
      position: input.from?.position ?? keyAfter(existing),
      supersetKey: input.from?.supersetKey ?? null,
      restSec: input.from?.restSec ?? null,
    });
    const machine = input.machineProfileId ? ((await tx.machineProfiles.get(input.machineProfileId)) ?? null) : null;
    const last = await tx.sets.lastTime({ exerciseId: input.exercise.id, machineProfileId: input.machineProfileId, beforeLocalDate: workout.localDate });
    const lastWarm = last?.sets.filter((s) => s.setType === "WARMUP") ?? [];
    const lastWork = last?.sets.filter((s) => s.setType !== "WARMUP") ?? [];
    const warmup = input.from ? input.from.warmupSets : 0;
    const working = input.from ? input.from.workingSets : Math.min(5, Math.max(1, lastWork.length));
    const unit = machine?.labelUnit ?? input.unit;
    let position: string | null = null;
    const plan: [SetType, GhostSource | undefined][] = [
      ...Array.from({ length: warmup }, (_, i): [SetType, GhostSource | undefined] => ["WARMUP", lastWarm[i]]),
      ...Array.from({ length: working }, (_, i): [SetType, GhostSource | undefined] => ["WORKING", lastWork[Math.min(i, lastWork.length - 1)]]),
    ];
    for (const [setType, ref] of plan) {
      position = generateKeyBetween(position, null);
      await tx.sets.create({
        workoutExerciseId: we.id,
        position,
        setType,
        weightKg: ref?.weightKg ?? null,
        inputUnit: ref?.inputUnit ?? unit,
        reps: ref?.reps ?? null,
        durationSec: ref?.durationSec ?? null,
        distanceM: ref?.distanceM ?? null,
      });
    }
    return we;
  });
}

/** Append a planned set (or, for history edits, an already completed one) copying the previous set's numbers. */
export async function addSet(repo: Repo, workoutExerciseId: string, opts: { unit: WeightUnit; completedAt?: string | null; setType?: SetType }): Promise<WorkoutSetRow> {
  return repo.transact(async (tx) => {
    const we = await tx.workoutExercises.get(workoutExerciseId);
    if (!we) throw new Error("addSet: the exercise no longer exists");
    const sets = await tx.sets.forWorkoutExercise(workoutExerciseId);
    const prev = sets[sets.length - 1];
    const machine = we.machineProfileId ? ((await tx.machineProfiles.get(we.machineProfileId)) ?? null) : null;
    return tx.sets.create({
      workoutExerciseId,
      position: keyAfter(sets),
      setType: opts.setType ?? "WORKING",
      weightKg: prev?.weightKg ?? null,
      inputUnit: prev?.inputUnit ?? machine?.labelUnit ?? opts.unit,
      reps: prev?.reps ?? null,
      durationSec: prev?.durationSec ?? null,
      distanceM: prev?.distanceM ?? null,
      completedAt: opts.completedAt ?? null,
    });
  });
}

// ───────────────────────────── completing sets ─────────────────────────────

export type CompletionResult = { ok: true; patch: WorkoutSetPatch } | { ok: false; error: string };

/**
 * What tapping the check does: stamp `completedAt` and fill what the lifter left blank from last time's matching set
 * (so "same as last time" is one tap). Reps (or seconds) cannot be guessed from nothing: that is an error.
 */
export function completionPatch(set: WorkoutSetRow, exercise: Pick<ExerciseRow, "tracking" | "loadType">, ghost: GhostSource | null, now: Date): CompletionResult {
  const fields = setFields(exercise);
  const patch: WorkoutSetPatch = { completedAt: now.toISOString() };
  if (fields.reps && set.reps === null) {
    if (ghost?.reps == null) return { ok: false, error: "Enter the reps first." };
    patch.reps = ghost.reps;
  }
  if (fields.duration && set.durationSec === null) {
    if (ghost?.durationSec == null) return { ok: false, error: "Enter the time first." };
    patch.durationSec = ghost.durationSec;
  }
  if (fields.weight && set.weightKg === null) {
    if (ghost?.weightKg != null) {
      patch.weightKg = ghost.weightKg;
      patch.inputUnit = ghost.inputUnit ?? set.inputUnit;
    } else if (exercise.loadType === "BODYWEIGHT_PLUS") patch.weightKg = 0;
  }
  return { ok: true, patch };
}

// ───────────────────────────── finishing ─────────────────────────────

/** End the workout: planned (never completed) sets and exercises with nothing done are dropped, then `endedAt` is stamped. */
export async function finishWorkout(repo: Repo, workoutId: string, now: Date = new Date()): Promise<WorkoutRow> {
  return repo.transact(async (tx) => {
    for (const we of await tx.workoutExercises.forWorkout(workoutId)) {
      const sets = await tx.sets.forWorkoutExercise(we.id);
      if (!sets.some((s) => s.completedAt != null)) {
        await tx.workoutExercises.remove(we.id); // tombstones its sets too
        continue;
      }
      for (const set of sets) if (set.completedAt == null) await tx.sets.remove(set.id);
    }
    return tx.workouts.finish(workoutId, now.toISOString());
  });
}

export async function discardWorkout(repo: Repo, workoutId: string): Promise<void> {
  await repo.workouts.remove(workoutId);
}

// ───────────────────────────── ordering and supersets ─────────────────────────────

/** The fractional-index key that moves `id` one slot up or down in `rows` (ordered by position); null at the ends. */
export function movedPosition(rows: { id: string; position: string }[], id: string, direction: "up" | "down"): string | null {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  if (direction === "up") {
    if (i === 0) return null;
    return generateKeyBetween((rows[i - 2] as { position: string } | undefined)?.position ?? null, (rows[i - 1] as { position: string }).position);
  }
  if (i === rows.length - 1) return null;
  return generateKeyBetween((rows[i + 1] as { position: string }).position, (rows[i + 2] as { position: string } | undefined)?.position ?? null);
}

/** Link `id` with the exercise below it (sharing one key), or take it out of its superset. */
export function supersetPatches(rows: { id: string; supersetKey: string | null }[], id: string, mode: "link-next" | "unlink"): { id: string; supersetKey: string | null }[] {
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return [];
  const row = rows[i] as { id: string; supersetKey: string | null };
  if (mode === "unlink") return row.supersetKey ? [{ id, supersetKey: null }] : [];
  const next = rows[i + 1];
  if (!next) return [];
  const key = row.supersetKey ?? next.supersetKey ?? `ss-${newId().slice(-8)}`;
  return [row, next].filter((r) => r.supersetKey !== key).map((r) => ({ id: r.id, supersetKey: key }));
}

/** A superset is two or more neighbours sharing a key: the key's label ("A", "B") for each exercise that is part of one. */
export function supersetLabels(rows: { id: string; supersetKey: string | null }[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.supersetKey) counts.set(r.supersetKey, (counts.get(r.supersetKey) ?? 0) + 1);
  const labels = new Map<string, string>();
  const letters = new Map<string, string>();
  for (const r of rows) {
    if (!r.supersetKey || (counts.get(r.supersetKey) ?? 0) < 2) continue;
    if (!letters.has(r.supersetKey)) letters.set(r.supersetKey, String.fromCharCode(65 + (letters.size % 26)));
    labels.set(r.id, letters.get(r.supersetKey) as string);
  }
  return labels;
}

// ───────────────────────────── templates ─────────────────────────────

/** Save what was actually done as a new template (set counts from the completed sets, rep range from the working reps). */
export async function saveWorkoutAsTemplate(repo: Repo, workoutId: string, name: string, folder: string | null = null): Promise<TemplateRow> {
  return repo.transact(async (tx) => {
    const existing = (await tx.templates.list()).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const template = await tx.templates.create({ name: name.trim(), folder: folder?.trim() || null, position: keyAfter(existing) });
    let position: string | null = null;
    for (const we of await tx.workoutExercises.forWorkout(workoutId)) {
      const sets = (await tx.sets.forWorkoutExercise(we.id)).filter((s) => s.completedAt != null);
      if (sets.length === 0) continue;
      const working = sets.filter((s) => s.setType !== "WARMUP");
      const reps = working.map((s) => s.reps).filter((r): r is number => r != null && r >= 1);
      position = generateKeyBetween(position, null);
      await tx.templateExercises.create({
        templateId: template.id,
        exerciseId: we.exerciseId,
        machineProfileId: we.machineProfileId,
        position,
        warmupSets: Math.min(50, sets.length - working.length),
        workingSets: Math.min(50, Math.max(1, working.length)),
        repMin: reps.length > 0 ? Math.min(...reps) : null,
        repMax: reps.length > 0 ? Math.max(...reps) : null,
        restSec: we.restSec,
        supersetKey: we.supersetKey,
      });
    }
    return template;
  });
}

/** A copy of a template (name + " (copy)", same folder, last in the list) with all of its exercises. */
export async function duplicateTemplate(repo: Repo, templateId: string): Promise<TemplateRow> {
  return repo.transact(async (tx) => {
    const source = await tx.templates.get(templateId);
    if (!source) throw new Error("That template no longer exists.");
    const existing = (await tx.templates.list()).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const suffix = " (copy)";
    const copy = await tx.templates.create({
      name: `${source.name.slice(0, 120 - suffix.length)}${suffix}`,
      folder: source.folder,
      notes: source.notes,
      position: keyAfter(existing),
    });
    for (const te of await tx.templates.exercisesOf(templateId)) {
      await tx.templateExercises.create({
        templateId: copy.id,
        exerciseId: te.exerciseId,
        machineProfileId: te.machineProfileId,
        position: te.position,
        warmupSets: te.warmupSets,
        workingSets: te.workingSets,
        repMin: te.repMin,
        repMax: te.repMax,
        targetRir: te.targetRir,
        restSec: te.restSec,
        supersetKey: te.supersetKey,
        notes: te.notes,
      });
    }
    return copy;
  });
}

/** Templates most recently started first (by the newest workout that used each), then the never-used ones in their own order. */
export function templatesByRecentUse<T extends Pick<TemplateRow, "id" | "position">>(templates: T[], workouts: Pick<WorkoutRow, "templateId" | "startedAt">[]): T[] {
  const lastUsed = new Map<string, string>();
  for (const w of workouts) {
    if (w.templateId && w.startedAt > (lastUsed.get(w.templateId) ?? "")) lastUsed.set(w.templateId, w.startedAt);
  }
  return [...templates].sort((a, b) => {
    const ua = lastUsed.get(a.id);
    const ub = lastUsed.get(b.id);
    if (ua && ub) return ua < ub ? 1 : ua > ub ? -1 : 0;
    if (ua) return -1;
    if (ub) return 1;
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
  });
}

export function templatePositionAfter(rows: { position: string }[]): string {
  return keyAfter(rows);
}
