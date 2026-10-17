import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { FakeServer } from "@/client/sync/fake-server";
import { createEngine } from "@/client/sync/engine";
import { newDevice, workoutInput, type TestDevice } from "@/client/repo/test-utils";
import { createStatusStore, createSyncedListeners } from "@/client/sync/status";
import { META_KEYS, getMeta, setMeta } from "./schema";

const devices: TestDevice[] = [];
const device = () => {
  const d = newDevice();
  devices.push(d);
  return d;
};
afterEach(() => {
  for (const d of devices.splice(0)) d.db.close();
});

const pointer = (d: TestDevice) => getMeta<string>(d.db, META_KEYS.activeWorkout);

describe("the active-workout pointer", () => {
  it("follows start, finish and discard", async () => {
    const d = device();
    expect(await pointer(d)).toBe("");
    expect(await d.repo.workouts.active()).toBeUndefined();

    const first = await d.repo.workouts.create(workoutInput());
    expect(await pointer(d)).toBe(first.id);
    expect((await d.repo.workouts.active())?.id).toBe(first.id);

    await d.repo.workouts.finish(first.id);
    expect(await pointer(d)).toBe("");
    expect(await d.repo.workouts.active()).toBeUndefined();

    const second = await d.repo.workouts.create(workoutInput({ startedAt: "2026-10-13T17:00:00.000Z", localDate: "2026-10-13" }));
    expect((await d.repo.workouts.active())?.id).toBe(second.id);
    await d.repo.workouts.remove(second.id);
    expect(await pointer(d)).toBe("");
    expect(await d.repo.workouts.active()).toBeUndefined();
  });

  it("is not touched by set writes", async () => {
    const d = device();
    const workout = await d.repo.workouts.create(workoutInput());
    const writes: unknown[] = [];
    d.db.meta.hook("updating", (_mods, key) => void (key === META_KEYS.activeWorkout && writes.push(key)));
    const exercise = await d.repo.exercises.create({ slug: "bench", name: "Bench", modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL" });
    const we = await d.repo.workoutExercises.create({ workoutId: workout.id, exerciseId: exercise.id, position: "a0" });
    await d.repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 60, reps: 5 });
    expect(writes).toHaveLength(0);
  });

  it("does not read the workout history to find the active workout", async () => {
    const d = device();
    for (let i = 0; i < 40; i++) {
      const w = await d.repo.workouts.create(workoutInput({ startedAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z`, localDate: "2026-09-01" }));
      await d.repo.workouts.finish(w.id);
    }
    const active = await d.repo.workouts.create(workoutInput({ startedAt: "2026-10-12T17:00:00.000Z" }));
    let rowsRead = 0;
    d.db.workout.hook("reading", (row) => {
      rowsRead += 1;
      return row;
    });
    expect((await d.repo.workouts.active())?.id).toBe(active.id);
    expect(rowsRead).toBeLessThanOrEqual(2);
    await d.repo.workouts.finish(active.id);
    rowsRead = 0;
    expect(await d.repo.workouts.active()).toBeUndefined(); // "none" is also answered from the pointer
    expect(rowsRead).toBe(0);
  });

  it("falls back to the scan when the pointer is missing or stale", async () => {
    const d = device();
    const workout = await d.repo.workouts.create(workoutInput());
    await d.db.meta.delete(META_KEYS.activeWorkout);
    expect((await d.repo.workouts.active())?.id).toBe(workout.id);
    await setMeta(d.db, META_KEYS.activeWorkout, "no-such-workout");
    expect((await d.repo.workouts.active())?.id).toBe(workout.id);
  });

  it("is updated by a pull that brings in a workout started on another device", async () => {
    const server = new FakeServer();
    const make = () => {
      const d = device();
      const engine = createEngine({ db: d.db, fetch: server.fetch as typeof fetch, status: createStatusStore(), listeners: createSyncedListeners() });
      return { d, engine };
    };
    const a = make();
    const b = make();
    const workout = await a.d.repo.workouts.create(workoutInput());
    await a.engine.syncNow("start");
    await b.engine.syncNow("start");
    expect(await pointer(b.d)).toBe(workout.id);
    expect((await b.d.repo.workouts.active())?.id).toBe(workout.id);

    await a.d.repo.workouts.finish(workout.id);
    await a.engine.syncNow("start");
    await b.engine.syncNow("start");
    expect(await pointer(b.d)).toBe("");
    expect(await b.d.repo.workouts.active()).toBeUndefined();
  });
});
