import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { resetAllDbs } from "@/client/db/active";
import { exerciseInput, newDevice, type TestDevice } from "@/client/repo/test-utils";
import type { WorkoutSetRow } from "@/contracts/entities";
import { addExerciseToWorkout, addSet, carryForwardPatch, completionPatch, finishWorkout, ghostSet, duplicateTemplate, movedPosition, saveWorkoutAsTemplate, shownWeight, startWorkout, supersetLabels, supersetPatches, templatesByRecentUse, unitForSet, weightPatch, weightStep } from "./session";

let device: TestDevice;
const fresh = () => (device = newDevice());
afterEach(async () => {
  device?.db.close();
  await resetAllDbs();
});

const at = (iso: string) => new Date(iso);

/** A finished workout on `localDate` with the given completed sets for one exercise (optionally on a machine). */
async function log(
  { repo }: TestDevice,
  exerciseId: string,
  localDate: string,
  sets: { weightKg: number; reps: number; setType?: "WARMUP" | "WORKING" }[],
  machineProfileId: string | null = null,
) {
  const workout = await repo.workouts.create({ startedAt: `${localDate}T17:00:00.000Z`, localDate, timezone: "UTC", endedAt: `${localDate}T18:00:00.000Z` });
  const we = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId, machineProfileId, position: "a0" });
  let position = "a";
  for (const [i, s] of sets.entries()) {
    position = `a${i}`;
    await repo.sets.create({ workoutExerciseId: we.id, position, setType: s.setType ?? "WORKING", weightKg: s.weightKg, inputUnit: "KG", reps: s.reps, completedAt: `${localDate}T17:${10 + i}:00.000Z` });
  }
  return { workout, we };
}

describe("startWorkout", () => {
  it("writes the device's local date and timezone, and is idempotent while a workout is active", async () => {
    const { repo } = fresh();
    // 2026-10-14T03:30Z is still the 13th in Los Angeles.
    const w = await startWorkout(repo, { unit: "KG", now: at("2026-10-14T03:30:00.000Z"), timeZone: "America/Los_Angeles" });
    expect(w).toMatchObject({ localDate: "2026-10-13", timezone: "America/Los_Angeles", startedAt: "2026-10-14T03:30:00.000Z", endedAt: null, templateId: null });
    expect((await repo.workouts.active())?.id).toBe(w.id);
    expect((await startWorkout(repo, { unit: "KG" })).id).toBe(w.id);
    expect(await device.db.workout.count()).toBe(1);
  });

  it("repeats a past workout: its title, exercises in order and completed set counts, prefilled from that session", async () => {
    const { repo } = fresh();
    const squat = await repo.exercises.create(exerciseInput({ slug: "squat", name: "Squat" }));
    const curl = await repo.exercises.create(exerciseInput({ slug: "curl", name: "Leg curl" }));
    const past = await repo.workouts.create({ title: "Lower A", startedAt: "2026-10-12T17:00:00.000Z", localDate: "2026-10-12", timezone: "UTC", endedAt: "2026-10-12T18:00:00.000Z" });
    const weSquat = await repo.workoutExercises.create({ workoutId: past.id, exerciseId: squat.id, machineProfileId: null, position: "a0", restSec: 180 });
    const weCurl = await repo.workoutExercises.create({ workoutId: past.id, exerciseId: curl.id, machineProfileId: null, position: "a1" });
    const done = (we: string, position: string, setType: "WARMUP" | "WORKING", weightKg: number, reps: number, completed = true) =>
      repo.sets.create({ workoutExerciseId: we, position, setType, weightKg, inputUnit: "KG", reps, completedAt: completed ? "2026-10-12T17:10:00.000Z" : null });
    await done(weSquat.id, "a0", "WARMUP", 60, 8);
    await done(weSquat.id, "a1", "WORKING", 110, 6);
    await done(weSquat.id, "a2", "WORKING", 110, 5);
    await done(weSquat.id, "a3", "WORKING", 110, 5, false);
    await done(weCurl.id, "a0", "WORKING", 40, 15);

    const w = await startWorkout(repo, { repeat: past, unit: "KG", now: at("2026-10-16T17:00:00.000Z"), timeZone: "UTC" });
    expect(w).toMatchObject({ title: "Lower A", templateId: null, localDate: "2026-10-16" });
    const wes = await repo.workoutExercises.forWorkout(w.id);
    expect(wes.map((e) => e.exerciseId)).toEqual([squat.id, curl.id]);
    expect(wes[0]).toMatchObject({ restSec: 180 });
    const squatSets = await repo.sets.forWorkoutExercise((wes[0] as { id: string }).id);
    expect(squatSets.map((s) => [s.setType, s.weightKg, s.reps, s.completedAt])).toEqual([
      ["WARMUP", 60, 8, null],
      ["WORKING", 110, 6, null],
      ["WORKING", 110, 5, null],
    ]);
  });

  it("creates the workout from a template: exercises, machine, set counts, superset and rest, prefilled from last time", async () => {
    const { repo } = fresh();
    const bench = await repo.exercises.create(exerciseInput({ slug: "bench", name: "Bench" }));
    const press = await repo.exercises.create(exerciseInput({ slug: "press", name: "Leg press", modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" }));
    const machine = await repo.machineProfiles.create({ name: "Hammer", exerciseId: press.id, labelUnit: "LB", pinStepKg: 5 });
    await log(device, bench.id, "2026-10-05", [
      { weightKg: 40, reps: 10, setType: "WARMUP" },
      { weightKg: 80, reps: 8 },
      { weightKg: 82.5, reps: 6 },
    ]);
    const template = await repo.templates.create({ name: "Push A", position: "a0" });
    await repo.templateExercises.create({ templateId: template.id, exerciseId: bench.id, position: "a0", warmupSets: 1, workingSets: 3, restSec: 120, supersetKey: "ss" });
    await repo.templateExercises.create({ templateId: template.id, exerciseId: press.id, machineProfileId: machine.id, position: "a1", warmupSets: 0, workingSets: 2, supersetKey: "ss" });

    const w = await startWorkout(repo, { template, unit: "KG", now: at("2026-10-12T17:00:00.000Z"), timeZone: "UTC" });
    expect(w).toMatchObject({ title: "Push A", templateId: template.id, localDate: "2026-10-12" });

    const wes = await repo.workoutExercises.forWorkout(w.id);
    expect(wes.map((e) => e.exerciseId)).toEqual([bench.id, press.id]);
    expect(wes[0]).toMatchObject({ restSec: 120, supersetKey: "ss", machineProfileId: null });
    expect(wes[1]).toMatchObject({ machineProfileId: machine.id, supersetKey: "ss" });

    const benchSets = await repo.sets.forWorkoutExercise((wes[0] as { id: string }).id);
    expect(benchSets.map((s) => [s.setType, s.weightKg, s.reps, s.completedAt])).toEqual([
      ["WARMUP", 40, 10, null],
      ["WORKING", 80, 8, null],
      ["WORKING", 82.5, 6, null],
      ["WORKING", 82.5, 6, null], // beyond last time's count: repeats the final set
    ]);
    const pressSets = await repo.sets.forWorkoutExercise((wes[1] as { id: string }).id);
    expect(pressSets).toHaveLength(2);
    expect(pressSets.every((s) => s.inputUnit === "LB" && s.seriesKey === `${press.id}:${machine.id}`)).toBe(true);
    expect(pressSets.every((s) => s.weightKg === null)).toBe(true); // no history on this machine
  });
});

describe("last-time lookup keeps machines apart", () => {
  it("returns the previous session of the same series only, ghosting set by set", async () => {
    const { repo } = fresh();
    const press = await repo.exercises.create(exerciseInput({ slug: "press", name: "Press", modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK" }));
    const a = await repo.machineProfiles.create({ name: "Gym A press", exerciseId: press.id });
    const b = await repo.machineProfiles.create({ name: "Gym B press", exerciseId: press.id });
    await log(device, press.id, "2026-10-01", [{ weightKg: 50, reps: 12 }], a.id);
    await log(device, press.id, "2026-10-08", [
      { weightKg: 40, reps: 12 },
      { weightKg: 45, reps: 10 },
    ], b.id);
    const lastA = await repo.sets.lastTime({ exerciseId: press.id, machineProfileId: a.id, beforeLocalDate: "2026-10-12" });
    expect(lastA?.localDate).toBe("2026-10-01");
    expect(lastA?.sets.map((s) => s.weightKg)).toEqual([50]);
    const lastB = await repo.sets.lastTime({ exerciseId: press.id, machineProfileId: b.id, beforeLocalDate: "2026-10-12" });
    expect(lastB?.sets.map((s) => s.weightKg)).toEqual([40, 45]);
    expect(await repo.sets.lastTime({ exerciseId: press.id, machineProfileId: null, beforeLocalDate: "2026-10-12" })).toBeUndefined();

    const w = await startWorkout(repo, { unit: "KG", now: at("2026-10-12T17:00:00.000Z"), timeZone: "UTC" });
    const we = await addExerciseToWorkout(repo, { workoutId: w.id, exercise: press, machineProfileId: b.id, unit: "KG" });
    const sets = await repo.sets.forWorkoutExercise(we.id);
    expect(sets.map((s) => s.weightKg)).toEqual([40, 45]);
    expect(ghostSet(lastB, sets, sets[1] as WorkoutSetRow)).toMatchObject({ weightKg: 45, reps: 10 });
    expect(ghostSet(lastB, [...sets, { ...(sets[1] as WorkoutSetRow), id: "x", position: "z" }], { ...(sets[1] as WorkoutSetRow), id: "x" })).toMatchObject({ weightKg: 45 });
    expect(ghostSet(undefined, sets, sets[0] as WorkoutSetRow)).toBeNull();
  });
});

describe("carrying a changed weight to the next set", () => {
  async function liveBench() {
    const { repo } = fresh();
    const bench = await repo.exercises.create(exerciseInput({ slug: "bench", name: "Bench" }));
    await log(device, bench.id, "2026-10-05", [
      { weightKg: 40, reps: 10, setType: "WARMUP" },
      { weightKg: 80, reps: 8 },
      { weightKg: 82.5, reps: 6 },
      { weightKg: 85, reps: 6 },
    ]);
    const w = await startWorkout(repo, { unit: "KG", now: at("2026-10-12T17:00:00.000Z"), timeZone: "UTC" });
    const we = await addExerciseToWorkout(repo, { workoutId: w.id, exercise: bench, machineProfileId: null, unit: "KG", from: undefined });
    const last = await repo.sets.lastTime({ exerciseId: bench.id, machineProfileId: null, beforeLocalDate: "2026-10-12" });
    const sets = await repo.sets.forWorkoutExercise(we.id);
    return { repo, sets, last };
  }
  const withWeight = (set: WorkoutSetRow, weightKg: number | null, completedAt: string | null = "2026-10-12T17:20:00.000Z") => ({ ...set, weightKg, completedAt });

  it("moves the next untouched set to the weight the lifter dialled", async () => {
    const { sets, last } = await liveBench();
    const [first, second] = sets.filter((s) => s.setType === "WORKING") as [WorkoutSetRow, WorkoutSetRow];
    expect([first.weightKg, second.weightKg]).toEqual([80, 82.5]);
    const logged = withWeight(first, 95);
    expect(carryForwardPatch(sets.map((s) => (s.id === logged.id ? logged : s)), logged, last)).toEqual({ id: second.id, patch: { weightKg: 95, inputUnit: first.inputUnit } });
  });

  it("leaves everything alone when the planned weight was logged, the next set was edited, or the set is a warm-up", async () => {
    const { sets, last } = await liveBench();
    const [first, second] = sets.filter((s) => s.setType === "WORKING") as [WorkoutSetRow, WorkoutSetRow];
    expect(carryForwardPatch(sets, withWeight(first, 80), last)).toBeNull();
    const edited = sets.map((s) => (s.id === second.id ? { ...s, weightKg: 90 } : s));
    expect(carryForwardPatch(edited, withWeight(first, 95), last)).toBeNull();
    const warm = sets.find((s) => s.setType === "WARMUP") as WorkoutSetRow;
    expect(carryForwardPatch(sets, withWeight(warm, 60), last)).toBeNull();
    const finalSet = sets[sets.length - 1] as WorkoutSetRow;
    expect(carryForwardPatch(sets, withWeight(finalSet, 100), last)).toBeNull();
  });

  it("chains: a carried weight that is logged as is carries on, and a set with no history takes the weight too", async () => {
    const { sets, last } = await liveBench();
    const working = sets.filter((s) => s.setType === "WORKING") as WorkoutSetRow[];
    const afterFirst = sets.map((s) => (s.id === working[1]?.id ? { ...s, weightKg: 95 } : s));
    const secondLogged = withWeight(afterFirst.find((s) => s.id === working[1]?.id) as WorkoutSetRow, 95);
    expect(carryForwardPatch(afterFirst, secondLogged, last)).toMatchObject({ id: working[2]?.id, patch: { weightKg: 95 } });
    const bare = [withWeight(working[0] as WorkoutSetRow, 70, null), { ...(working[1] as WorkoutSetRow), weightKg: null }];
    expect(carryForwardPatch(bare, withWeight(bare[0] as WorkoutSetRow, 70), undefined)).toMatchObject({ id: working[1]?.id, patch: { weightKg: 70 } });
  });
});

describe("weights: unit round trip and steps", () => {
  it("135 lb is stored as kg and shown back as exactly 135", () => {
    for (const lb of [45, 135, 137.5, 225, 315, 12.5]) {
      const patch = weightPatch(lb, "LB");
      expect(patch.inputUnit).toBe("LB");
      expect(patch.weightKg).not.toBeNull();
      expect(shownWeight(patch.weightKg as number, "LB")).toBe(lb);
    }
    expect(weightPatch(62.5, "KG")).toEqual({ weightKg: 62.5, inputUnit: "KG" });
    expect(weightPatch(null, "KG")).toEqual({ weightKg: null, inputUnit: "KG" });
    expect(shownWeight(null, "KG")).toBeNull();
  });

  it("a row's unit is what it was typed in, else the machine's label unit, else the preference; pin step wins for steps", () => {
    expect(unitForSet({ inputUnit: "LB" }, { labelUnit: "KG" }, "KG")).toBe("LB");
    expect(unitForSet({ inputUnit: null }, { labelUnit: "LB" }, "KG")).toBe("LB");
    expect(unitForSet(null, null, "KG")).toBe("KG");
    expect(weightStep("KG", { equipment: "BARBELL" }, null)).toBe(2.5);
    expect(weightStep("LB", { equipment: "BARBELL" }, null)).toBe(5);
    expect(weightStep("KG", { equipment: "MACHINE_SELECTORIZED" }, { pinStepKg: 4.5 })).toBe(4.5);
  });
});

describe("completing and finishing", () => {
  it("fills blanks from last time, requires reps, and finishing drops planned sets and empty exercises", async () => {
    const { repo } = fresh();
    const bench = await repo.exercises.create(exerciseInput({ slug: "bench", name: "Bench" }));
    const row = await repo.exercises.create(exerciseInput({ slug: "row", name: "Row" }));
    await log(device, bench.id, "2026-10-05", [{ weightKg: 80, reps: 8 }]);
    const w = await startWorkout(repo, { unit: "KG", now: at("2026-10-12T17:00:00.000Z"), timeZone: "UTC" });
    const we = await addExerciseToWorkout(repo, { workoutId: w.id, exercise: bench, machineProfileId: null, unit: "KG" });
    await addExerciseToWorkout(repo, { workoutId: w.id, exercise: row, machineProfileId: null, unit: "KG" });
    const added = await addSet(repo, we.id, { unit: "KG" });
    expect(added).toMatchObject({ weightKg: 80, reps: 8, completedAt: null });

    const blank = await repo.sets.create({ workoutExerciseId: we.id, position: "zz" });
    expect(completionPatch(blank, bench, null, new Date())).toEqual({ ok: false, error: "Enter the reps first." });
    const filled = completionPatch(blank, bench, { weightKg: 80, reps: 8, inputUnit: "KG", durationSec: null, distanceM: null }, at("2026-10-12T17:05:00.000Z"));
    expect(filled).toEqual({ ok: true, patch: { completedAt: "2026-10-12T17:05:00.000Z", reps: 8, weightKg: 80, inputUnit: "KG" } });
    const bw = completionPatch(blank, { tracking: "LOAD_REPS", loadType: "BODYWEIGHT_PLUS" }, { weightKg: null, reps: 5, inputUnit: null, durationSec: null, distanceM: null }, new Date());
    expect(bw).toMatchObject({ ok: true, patch: { weightKg: 0, reps: 5 } });

    const [first] = await repo.sets.forWorkoutExercise(we.id);
    await repo.sets.update((first as WorkoutSetRow).id, { completedAt: "2026-10-12T17:05:00.000Z" });
    const done = await finishWorkout(repo, w.id, at("2026-10-12T18:00:00.000Z"));
    expect(done.endedAt).toBe("2026-10-12T18:00:00.000Z");
    expect(await repo.workouts.active()).toBeUndefined();
    expect(await repo.sets.forWorkoutExercise(we.id)).toHaveLength(1); // planned sets are gone
    expect((await repo.workoutExercises.forWorkout(w.id)).map((e) => e.exerciseId)).toEqual([bench.id]); // empty "Row" is gone
  });
});

describe("ordering, supersets and save-as-template", () => {
  it("movedPosition swaps neighbours and refuses to move past the ends", () => {
    const rows = [
      { id: "a", position: "a0" },
      { id: "b", position: "a1" },
      { id: "c", position: "a2" },
    ];
    const order = (moved: string, key: string | null) => rows.map((r) => (r.id === moved ? { ...r, position: key as string } : r)).sort((x, y) => (x.position < y.position ? -1 : 1)).map((r) => r.id);
    expect(order("c", movedPosition(rows, "c", "up"))).toEqual(["a", "c", "b"]);
    expect(order("a", movedPosition(rows, "a", "down"))).toEqual(["b", "a", "c"]);
    expect(order("b", movedPosition(rows, "b", "up"))).toEqual(["b", "a", "c"]);
    expect(movedPosition(rows, "a", "up")).toBeNull();
    expect(movedPosition(rows, "c", "down")).toBeNull();
    expect(movedPosition(rows, "zzz", "up")).toBeNull();
  });

  it("links with the next exercise, labels supersets and ignores a lone key", () => {
    const rows = [
      { id: "a", supersetKey: null },
      { id: "b", supersetKey: null },
      { id: "c", supersetKey: null },
    ];
    const patches = supersetPatches(rows, "a", "link-next");
    expect(patches.map((p) => p.id)).toEqual(["a", "b"]);
    expect(new Set(patches.map((p) => p.supersetKey)).size).toBe(1);
    const linked = rows.map((r) => ({ id: r.id, supersetKey: patches.find((p) => p.id === r.id)?.supersetKey ?? r.supersetKey }));
    expect([...supersetLabels(linked).entries()]).toEqual([["a", "A"], ["b", "A"]]);
    expect(supersetPatches(linked, "b", "link-next")).toEqual([{ id: "c", supersetKey: patches[0]?.supersetKey }]); // extends the group
    expect(supersetPatches(linked, "c", "link-next")).toEqual([]);
    expect(supersetPatches(linked, "a", "unlink")).toEqual([{ id: "a", supersetKey: null }]);
    expect(supersetLabels([{ id: "a", supersetKey: "k" }, { id: "b", supersetKey: null }]).size).toBe(0);
  });

  it("saves a workout as a template from the sets actually done", async () => {
    const { repo } = fresh();
    const bench = await repo.exercises.create(exerciseInput({ slug: "bench", name: "Bench" }));
    const { workout } = await log(device, bench.id, "2026-10-05", [
      { weightKg: 40, reps: 10, setType: "WARMUP" },
      { weightKg: 80, reps: 8 },
      { weightKg: 80, reps: 6 },
    ]);
    const template = await saveWorkoutAsTemplate(repo, workout.id, "  My push  ");
    expect(template.name).toBe("My push");
    const lines = await repo.templates.exercisesOf(template.id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ exerciseId: bench.id, warmupSets: 1, workingSets: 2, repMin: 6, repMax: 8 });
    const second = await saveWorkoutAsTemplate(repo, workout.id, "Second");
    expect(second.position > template.position).toBe(true);
  });
});

describe("duplicateTemplate", () => {
  it("copies the template and every exercise line, leaving the original untouched", async () => {
    const { repo } = fresh();
    const bench = await repo.exercises.create(exerciseInput({ slug: "bench", name: "Bench" }));
    const original = await repo.templates.create({ name: "Push", folder: "PPL", position: "a0" });
    await repo.templateExercises.create({ templateId: original.id, exerciseId: bench.id, position: "a0", warmupSets: 1, workingSets: 4, repMin: 6, repMax: 8, targetRir: 2, restSec: 150, supersetKey: "ss-1" });
    const copy = await duplicateTemplate(repo, original.id);
    expect(copy).toMatchObject({ name: "Push (copy)", folder: "PPL" });
    expect(copy.id).not.toBe(original.id);
    expect(copy.position > original.position).toBe(true);
    const [line] = await repo.templates.exercisesOf(copy.id);
    expect(line).toMatchObject({ exerciseId: bench.id, warmupSets: 1, workingSets: 4, repMin: 6, repMax: 8, targetRir: 2, restSec: 150, supersetKey: "ss-1" });
    expect(await repo.templates.exercisesOf(original.id)).toHaveLength(1);
    expect(await repo.templates.list()).toHaveLength(2);
  });

  it("keeps the name within the 120-character limit and rejects a missing template", async () => {
    const { repo } = fresh();
    const long = await repo.templates.create({ name: "x".repeat(120), position: "a0" });
    expect((await duplicateTemplate(repo, long.id)).name).toHaveLength(120);
    await expect(duplicateTemplate(repo, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("no longer exists");
  });
});

describe("templatesByRecentUse", () => {
  it("puts the most recently started template first, then never-used ones by position", () => {
    const t = (id: string, position: string) => ({ id, position });
    const ordered = templatesByRecentUse(
      [t("a", "a0"), t("b", "a1"), t("c", "a2"), t("d", "a3")],
      [
        { templateId: "c", startedAt: "2026-10-01T10:00:00.000Z" },
        { templateId: "b", startedAt: "2026-10-10T10:00:00.000Z" },
        { templateId: "c", startedAt: "2026-10-12T10:00:00.000Z" },
        { templateId: null, startedAt: "2026-10-13T10:00:00.000Z" },
      ],
    );
    expect(ordered.map((x) => x.id)).toEqual(["c", "b", "a", "d"]);
  });
});
