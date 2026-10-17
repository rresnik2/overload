import { describe, expect, it } from "vitest";
import { ENTITY_NAMES } from "@/contracts/entities";
import { writeScope } from "./core";
import { exerciseInput, newDevice, seedWorkout } from "./test-utils";

describe("writeScope (the stores a write may touch)", () => {
  it("a set write stays out of templates, favorites and the machine-independent stores", () => {
    const scope = writeScope("workoutSet");
    for (const table of ["workoutSet", "workoutExercise", "workout", "exercise", "catalog", "machineProfile", "bodyMetric", "meta", "outbox"]) expect(scope).toContain(table);
    for (const table of ["template", "templateExercise", "exerciseFavorite"]) expect(scope).not.toContain(table);
  });

  it("every entity's scope has its own table, the clock and the outbox, and a favorite is cheap", () => {
    for (const entity of ENTITY_NAMES) expect(writeScope(entity)).toEqual(expect.arrayContaining([entity, "meta", "outbox"]));
    expect(writeScope("exerciseFavorite").sort()).toEqual(["catalog", "exercise", "exerciseFavorite", "meta", "outbox"]);
  });

  it("deleting cascades inside the narrow scope: a workout takes its exercises and sets, an exercise takes its star, a template its rows", async () => {
    const { repo, db } = newDevice();
    const { exercise, workout, we } = await seedWorkout(repo);
    const set = await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 100, reps: 5 });
    await repo.favorites.toggle(exercise.id);
    const template = await repo.templates.create({ name: "Push", position: "a0" });
    await repo.templateExercises.create({ templateId: template.id, exerciseId: exercise.id, position: "a0" });
    await repo.templates.remove(template.id);
    expect(await repo.templates.exercisesOf(template.id)).toEqual([]);
    await repo.workouts.remove(workout.id);
    expect(await repo.sets.get(set.id)).toBeUndefined();
    expect(await repo.workoutExercises.get(we.id)).toBeUndefined();
    await repo.exercises.remove(exercise.id);
    expect(await repo.favorites.isFavorite(exercise.id)).toBe(false);
    db.close();
  });

  it("re-derives set columns when a parent changes (machine, workout, exercise), all inside their scopes", async () => {
    const { repo, db } = newDevice();
    const { exercise, we, workout } = await seedWorkout(repo, { exercise: exerciseInput({ slug: "row", loadType: "BODYWEIGHT_PLUS" }) });
    const machine = await repo.machineProfiles.create({ exerciseId: exercise.id, name: "Rig", baseLoadKg: 10, labelUnit: "KG" });
    await repo.workoutExercises.update(we.id, { machineProfileId: machine.id });
    const set = await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 20, reps: 5 });
    await repo.bodyMetrics.create({ measuredAt: `${workout.localDate}T06:00:00.000Z`, localDate: workout.localDate, weightKg: 80 });
    await repo.machineProfiles.update(machine.id, { baseLoadKg: 12 });
    await repo.workouts.update(workout.id, { bodyweightKg: 82 });
    await repo.exercises.update(exercise.id, { name: "Rows" });
    const after = await repo.sets.get(set.id);
    expect(after?.seriesKey).toContain(machine.id);
    db.close();
  });
});
