import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { RepoError, type Repo } from "@/contracts/repo";
import { catalogExerciseId } from "@/lib/ids";
import { HLC_REGEX } from "@/contracts/sync";
import { newDevice, exerciseInput, seedWorkout, workoutInput, type TestDevice } from "@/client/repo/test-utils";
import type { ExerciseRow } from "@/contracts/entities";
import { activateUserDb, closeUserDb, resetAllDbs } from "@/client/db/active";
import { createRepo } from "./repo";

let device: TestDevice;
const fresh = () => (device = newDevice());
afterEach(async () => {
  device?.db.close();
  await resetAllDbs();
});

const outbox = () => device.db.outbox.orderBy("seq").toArray();
const rejects = async (promise: Promise<unknown>, code: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepoError);
  expect((error as RepoError).code).toBe(code);
};

describe("repo writes: row + per-field HLC + outbox in one transaction", () => {
  it("create assigns a UUIDv7, stamps every field, and enqueues one full mutation", async () => {
    const { repo } = fresh();
    const row = await repo.workouts.create(workoutInput({ title: "Push" }));
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row).toMatchObject({ title: "Push", version: 0, deletedAt: null, isDeload: false, endedAt: null });
    expect(row.hlc).toMatch(HLC_REGEX);
    expect(Object.keys(row.fieldHlc).sort()).toEqual(["bodyweightKg", "endedAt", "isDeload", "localDate", "notes", "startedAt", "templateId", "timezone", "title"]);
    expect(new Set(Object.values(row.fieldHlc)).size).toBe(1);
    const queue = await outbox();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ entity: "workout", id: row.id });
    expect(Object.keys(queue[0]?.fields ?? {}).sort()).toEqual(Object.keys(row.fieldHlc).sort());
  });

  it("create honours opts.id and refuses duplicates and non-UUIDs", async () => {
    const { repo } = fresh();
    const id = "0192a5b0-0005-7000-8000-000000000009";
    expect((await repo.workouts.create(workoutInput(), { id })).id).toBe(id);
    await rejects(repo.workouts.create(workoutInput(), { id }), "CONFLICT");
    await rejects(repo.workouts.create(workoutInput(), { id: "nope" }), "INVALID");
  });

  it("rejects forbidden and unknown keys with FORBIDDEN_FIELD and invalid values with INVALID, writing nothing", async () => {
    const { repo } = fresh();
    for (const key of ["userId", "version", "hlc", "fieldHlc", "effectiveLoadKg", "e1rmKg", "seriesKey", "deletedAt"]) {
      await rejects(repo.workouts.create(workoutInput({ [key]: "x" })), "FORBIDDEN_FIELD");
    }
    await rejects(repo.workouts.create({ ...workoutInput(), localDate: "not-a-date" }), "INVALID");
    const w = await repo.workouts.create(workoutInput());
    await rejects(repo.workouts.update(w.id, { userId: "x" } as never), "FORBIDDEN_FIELD");
    await rejects(repo.workouts.update(w.id, { timezone: "" }), "INVALID");
    expect(await device.db.workout.count()).toBe(1);
    expect(await device.db.outbox.count()).toBe(1);
  });

  it("update merges only the patched fields with a fresh HLC, skips no-ops, and refuses missing rows", async () => {
    const { repo } = fresh();
    const w = await repo.workouts.create(workoutInput({ title: "A" }));
    const updated = await repo.workouts.update(w.id, { title: "B", notes: "n" });
    expect(updated).toMatchObject({ title: "B", notes: "n", timezone: "UTC" });
    expect(updated.fieldHlc.title && updated.fieldHlc.title > w.fieldHlc.title!).toBe(true);
    expect(updated.fieldHlc.timezone).toBe(w.fieldHlc.timezone); // untouched field keeps its HLC
    const queue = await outbox();
    expect(queue).toHaveLength(2);
    expect(queue[1]).toMatchObject({ fields: { title: "B", notes: "n" } });
    expect(Object.keys(queue[1]?.fieldHlc ?? {}).sort()).toEqual(["notes", "title"]);

    await repo.workouts.update(w.id, { title: "B" }); // same value: nothing to say
    expect(await device.db.outbox.count()).toBe(2);
    await rejects(repo.workouts.update("0192a5b0-0005-7000-8000-0000000000aa", { title: "x" }), "NOT_FOUND");
  });

  it("remove is a soft delete, idempotent, hidden from get/list", async () => {
    const { repo } = fresh();
    const w = await repo.workouts.create(workoutInput());
    await repo.workouts.remove(w.id);
    await repo.workouts.remove(w.id);
    await repo.workouts.remove("0192a5b0-0005-7000-8000-0000000000bb"); // unknown id: still fine
    expect(await repo.workouts.get(w.id)).toBeUndefined();
    expect(await repo.workouts.list()).toEqual([]);
    const stored = await device.db.workout.get(w.id);
    expect(stored?.deletedAt).not.toBeNull();
    const queue = await outbox();
    expect(queue.map((q) => Object.keys(q.fields))).toEqual([expect.arrayContaining(["startedAt"]), ["deletedAt"]]);
    await rejects(repo.workouts.update(w.id, { title: "zombie" }), "NOT_FOUND");
  });

  it("rejects dangling references", async () => {
    const { repo } = fresh();
    await rejects(repo.workoutExercises.create({ workoutId: "0192a5b0-0005-7000-8000-0000000000cc", exerciseId: "0192a5b0-0005-7000-8000-0000000000dd", position: "a0" }), "NOT_FOUND");
  });

  it("transact is atomic: a failure leaves neither rows nor outbox entries", async () => {
    const { repo } = fresh();
    await expect(
      repo.transact(async (tx) => {
        await tx.templates.create({ name: "T", position: "a0" });
        await tx.workouts.create(workoutInput());
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await device.db.template.count()).toBe(0);
    expect(await device.db.workout.count()).toBe(0);
    expect(await device.db.outbox.count()).toBe(0);

    const ids = await repo.transact(async (tx) => {
      const t = await tx.templates.create({ name: "T", position: "a0" });
      const w = await tx.workouts.create(workoutInput());
      return [t.id, w.id];
    });
    expect(ids).toHaveLength(2);
    expect(await device.db.outbox.count()).toBe(2);
  });
});

describe("derived set columns, cascades and queries", () => {
  it("mirrors seriesKey / localDate / effective load / e1RM on set writes and re-derives when a parent changes", async () => {
    const { repo } = fresh();
    const { exercise, workout, we } = await seedWorkout(repo);
    const set = await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 100, reps: 5, rir: 0, completedAt: "2026-10-12T17:10:00.000Z" });
    expect(set).toMatchObject({ workoutId: workout.id, exerciseId: exercise.id, machineProfileId: null, seriesKey: exercise.id, localDate: "2026-10-12", effectiveLoadKg: 100, e1rmKg: 116.667 });
    const heavier = await repo.sets.update(set.id, { weightKg: 110 });
    expect(heavier).toMatchObject({ effectiveLoadKg: 110, e1rmKg: 128.333 });
    await repo.workouts.update(workout.id, { localDate: "2026-10-11" });
    expect((await repo.sets.get(set.id))?.localDate).toBe("2026-10-11");
    // the outbox never carries derived columns
    expect((await outbox()).every((q) => !("seriesKey" in q.fields) && !("effectiveLoadKg" in q.fields))).toBe(true);
  });

  it("uses the machine profile for the series key and PLATES_PER_SIDE base load; bodyweight loads use the workout bodyweight", async () => {
    const { repo } = fresh();
    const press = await repo.exercises.create(exerciseInput({ slug: "leg-press", name: "Leg Press", modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" }));
    const machine = await repo.machineProfiles.create({ name: "Hammer", exerciseId: press.id, baseLoadKg: 50 });
    const pullUp = await repo.exercises.create(exerciseInput({ slug: "pull-up", name: "Pull-up", modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1 }));
    const workout = await repo.workouts.create(workoutInput({ bodyweightKg: 80 }));
    const weMachine = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: press.id, machineProfileId: machine.id, position: "a0" });
    const wePull = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: pullUp.id, position: "a1" });
    const legSet = await repo.sets.create({ workoutExerciseId: weMachine.id, position: "a0", weightKg: 100, reps: 10 });
    const pullSet = await repo.sets.create({ workoutExerciseId: wePull.id, position: "a0", weightKg: 10, reps: 5 });
    expect(legSet).toMatchObject({ seriesKey: `${press.id}:${machine.id}`, machineProfileId: machine.id, effectiveLoadKg: 250 });
    expect(pullSet.effectiveLoadKg).toBe(90);
    await repo.machineProfiles.update(machine.id, { baseLoadKg: 20 });
    expect((await repo.sets.get(legSet.id))?.effectiveLoadKg).toBe(220);
  });

  it("deleting a workout tombstones its exercises and sets (and queues those tombstones); a template takes its exercises", async () => {
    const { repo } = fresh();
    const { workout, we } = await seedWorkout(repo);
    const s1 = await repo.sets.create({ workoutExerciseId: we.id, position: "a0", reps: 5, weightKg: 50 });
    await repo.workouts.remove(workout.id);
    expect(await repo.workoutExercises.forWorkout(workout.id)).toEqual([]);
    expect(await repo.sets.get(s1.id)).toBeUndefined();
    expect(await repo.sets.forWorkout(workout.id)).toEqual([]);
    expect((await outbox()).filter((q) => "deletedAt" in q.fields).map((q) => q.entity).sort()).toEqual(["workout", "workoutExercise", "workoutSet"]);

    const t = await repo.templates.create({ name: "Push", position: "a0" });
    const ex = (await repo.exercises.list())[0] as ExerciseRow;
    const te = await repo.templateExercises.create({ templateId: t.id, exerciseId: ex.id, position: "a0" });
    await repo.templates.remove(t.id);
    expect(await repo.templateExercises.get(te.id)).toBeUndefined();
  });

  it("lastTime returns the previous session's completed sets for the same series, by position", async () => {
    const { repo } = fresh();
    const ex = await repo.exercises.create(exerciseInput());
    const log = async (localDate: string, sets: { pos: string; weightKg: number; completed?: boolean }[], machineProfileId: string | null = null) => {
      const w = await repo.workouts.create(workoutInput({ localDate, startedAt: `${localDate}T17:00:00.000Z` }));
      const we = await repo.workoutExercises.create({ workoutId: w.id, exerciseId: ex.id, machineProfileId, position: "a0" });
      for (const s of sets) await repo.sets.create({ workoutExerciseId: we.id, position: s.pos, weightKg: s.weightKg, reps: 5, completedAt: s.completed === false ? null : `${localDate}T17:30:00.000Z` });
      return w;
    };
    const machine = await repo.machineProfiles.create({ name: "M", exerciseId: ex.id });
    await log("2026-10-05", [{ pos: "a0", weightKg: 60 }]);
    const w2 = await log("2026-10-08", [{ pos: "a1", weightKg: 82.5 }, { pos: "a0", weightKg: 80 }, { pos: "a2", weightKg: 85, completed: false }]);
    await log("2026-10-09", [{ pos: "a0", weightKg: 200 }], machine.id); // another series
    const last = await repo.sets.lastTime({ exerciseId: ex.id, machineProfileId: null, beforeLocalDate: "2026-10-12" });
    expect(last).toMatchObject({ workoutId: w2.id, localDate: "2026-10-08" });
    expect(last?.sets.map((s) => s.weightKg)).toEqual([80, 82.5]);
    expect((await repo.sets.lastTime({ exerciseId: ex.id, machineProfileId: null, beforeLocalDate: "2026-10-08" }))?.localDate).toBe("2026-10-05");
    expect((await repo.sets.lastTime({ exerciseId: ex.id, machineProfileId: machine.id, beforeLocalDate: "2026-10-12" }))?.sets[0]?.weightKg).toBe(200);
    expect(await repo.sets.lastTime({ exerciseId: ex.id, machineProfileId: null, beforeLocalDate: "2026-10-01" })).toBeUndefined();
  });

  it("active, finish, inRange, recent and lastUsedFor", async () => {
    const { repo } = fresh();
    const a = await repo.exercises.create(exerciseInput({ slug: "a", name: "A" }));
    const b = await repo.exercises.create(exerciseInput({ slug: "b", name: "B", modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK" }));
    const m1 = await repo.machineProfiles.create({ name: "Gym 1", exerciseId: b.id });
    const m2 = await repo.machineProfiles.create({ name: "Gym 2", exerciseId: b.id });
    const w1 = await repo.workouts.create(workoutInput({ localDate: "2026-10-01", startedAt: "2026-10-01T10:00:00.000Z" }));
    const w2 = await repo.workouts.create(workoutInput({ localDate: "2026-10-03", startedAt: "2026-10-03T10:00:00.000Z" }));
    await repo.workoutExercises.create({ workoutId: w1.id, exerciseId: b.id, machineProfileId: m1.id, position: "a0" });
    await repo.workoutExercises.create({ workoutId: w2.id, exerciseId: b.id, machineProfileId: m2.id, position: "a0" });
    await repo.workoutExercises.create({ workoutId: w2.id, exerciseId: a.id, position: "a1" });
    expect((await repo.workouts.active())?.id).toBe(w2.id);
    const done = await repo.workouts.finish(w2.id, "2026-10-03T11:00:00.000Z");
    expect(done.endedAt).toBe("2026-10-03T11:00:00.000Z");
    expect((await repo.workouts.active())?.id).toBe(w1.id);
    await repo.workouts.finish(w1.id);
    expect(await repo.workouts.active()).toBeUndefined();
    expect((await repo.workouts.inRange("2026-10-01", "2026-10-02")).map((w) => w.id)).toEqual([w1.id]);
    expect((await repo.workouts.inRange("2026-10-01", "2026-10-31")).map((w) => w.id)).toEqual([w2.id, w1.id]);
    expect((await repo.exercises.recent(5)).map((e) => e.id)).toEqual([b.id, a.id]);
    expect((await repo.exercises.recent(1)).map((e) => e.id)).toEqual([b.id]);
    expect((await repo.machineProfiles.lastUsedFor(b.id))?.id).toBe(m2.id);
    expect(await repo.machineProfiles.lastUsedFor(a.id)).toBeUndefined();
    expect((await repo.machineProfiles.forExercise(b.id)).map((m) => m.name)).toEqual(["Gym 1", "Gym 2"]);
  });

  it("body metrics: inRange is inclusive and ascending, latest is the newest", async () => {
    const { repo } = fresh();
    for (const [d, kg] of [["2026-10-03", 81], ["2026-10-01", 80], ["2026-10-05", 82]] as const) {
      await repo.bodyMetrics.create({ measuredAt: `${d}T07:00:00.000Z`, localDate: d, weightKg: kg });
    }
    expect((await repo.bodyMetrics.inRange("2026-10-01", "2026-10-03")).map((m) => m.weightKg)).toEqual([80, 81]);
    expect((await repo.bodyMetrics.latest())?.weightKg).toBe(82);
  });

  it("orders workout exercises and sets by fractional-index position (code-unit order)", async () => {
    const { repo } = fresh();
    const { workout, we, exercise } = await seedWorkout(repo);
    const we2 = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: exercise.id, position: "Zz" }); // uppercase sorts BEFORE lowercase
    expect((await repo.workoutExercises.forWorkout(workout.id)).map((x) => x.id)).toEqual([we2.id, we.id]);
    await repo.sets.create({ workoutExerciseId: we.id, position: "a1", reps: 1, weightKg: 1 });
    await repo.sets.create({ workoutExerciseId: we.id, position: "a0", reps: 1, weightKg: 1 });
    expect((await repo.sets.forWorkoutExercise(we.id)).map((s) => s.position)).toEqual(["a0", "a1"]);
    expect((await repo.sets.forWorkout(workout.id)).map((s) => s.position)).toEqual(["a0", "a1"]);
  });
});

describe("catalog and exercise search", () => {
  const catalogRow = (name: string, over: Partial<ExerciseRow> = {}): ExerciseRow => ({
    id: catalogExerciseId(name),
    isCustom: false,
    sourceId: name,
    slug: name.toLowerCase().replaceAll("_", "-"),
    name: name.replaceAll("_", " "),
    aliases: [],
    modality: "FREE_WEIGHT",
    equipment: "BARBELL",
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
    hlc: "",
    fieldHlc: {},
    version: 0,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("replace caches the catalog (and its version); catalog rows are read-only; search spans catalog and custom", async () => {
    const { repo } = fresh();
    expect(await repo.catalog.version()).toBeNull();
    const squat = catalogRow("Barbell_Squat", { standardLift: "SQUAT", aliases: ["Back Squat"], muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }, { muscle: "GLUTES", role: "SECONDARY" }] });
    const curl = catalogRow("Cable_Curl", { modality: "CABLE", equipment: "CABLE", loadType: "STACK" });
    await repo.catalog.replace({ version: 3, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [squat, curl] });
    expect(await repo.catalog.version()).toBe(3);
    await repo.catalog.replace({ version: 4, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [squat, curl] });
    expect(await repo.catalog.version()).toBe(4);
    expect(await device.db.catalog.count()).toBe(2);

    await rejects(repo.exercises.update(squat.id, { name: "x" }), "READONLY_CATALOG");
    await rejects(repo.exercises.remove(squat.id), "READONLY_CATALOG");
    expect((await repo.exercises.get(squat.id))?.name).toBe("Barbell Squat");
    expect(await device.db.outbox.count()).toBe(0);

    const custom = await repo.exercises.create(exerciseInput({ slug: "my-squat", name: "Pause Squat", muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }] }));
    expect(custom.isCustom).toBe(true);
    expect((await repo.exercises.list()).map((e) => e.name).sort()).toEqual(["Barbell Squat", "Cable Curl", "Pause Squat"]);
    expect((await repo.exercises.search({ text: "squat" })).map((e) => e.name)).toEqual(["Barbell Squat", "Pause Squat"]);
    expect((await repo.exercises.search({ text: "BACK SQ" })).map((e) => e.name)).toEqual(["Barbell Squat"]); // alias
    expect((await repo.exercises.search({ modality: "CABLE" })).map((e) => e.name)).toEqual(["Cable Curl"]);
    expect((await repo.exercises.search({ muscle: "GLUTES" })).map((e) => e.name)).toEqual(["Barbell Squat"]); // secondary muscle matches
    expect((await repo.exercises.search({ standardLift: "SQUAT" })).map((e) => e.name)).toEqual(["Barbell Squat"]);
    expect((await repo.exercises.search({ customOnly: true })).map((e) => e.name)).toEqual(["Pause Squat"]);
    expect(await repo.exercises.search({ limit: 1 })).toHaveLength(1);
    expect((await repo.exercises.bySlug("my-squat"))?.id).toBe(custom.id);
    expect((await repo.exercises.bySlug("barbell-squat"))?.id).toBe(squat.id);
    expect(await repo.exercises.bySlug("nope")).toBeUndefined();
    // a workout exercise can reference a catalog exercise
    const w = await repo.workouts.create(workoutInput());
    await repo.workoutExercises.create({ workoutId: w.id, exerciseId: squat.id, position: "a0" });
  });
});

describe("every method of the Repo contract", () => {
  const methodPaths = (obj: object, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([k, v]) => (typeof v === "function" ? [prefix + k] : v && typeof v === "object" ? methodPaths(v, `${prefix}${k}.`) : []));

  it("is fully implemented: a call exists for every method and every call works", async () => {
    const { repo } = fresh();
    const { exercise, workout, we } = await seedWorkout(repo);
    const machine = await repo.machineProfiles.create({ name: "M", exerciseId: exercise.id });
    const template = await repo.templates.create({ name: "T", position: "a0" });
    const te = await repo.templateExercises.create({ templateId: template.id, exerciseId: exercise.id, position: "a0" });
    const bm = await repo.bodyMetrics.create({ measuredAt: "2026-10-12T07:00:00.000Z", localDate: "2026-10-12", weightKg: 80 });
    const set = await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 50, reps: 5, completedAt: "2026-10-12T17:30:00.000Z" });
    const calls: Record<string, (r: Repo) => Promise<unknown>> = {
      "exercises.get": (r) => r.exercises.get(exercise.id),
      "exercises.list": (r) => r.exercises.list(),
      "exercises.create": (r) => r.exercises.create(exerciseInput({ slug: "x2", name: "X2" })),
      "exercises.update": (r) => r.exercises.update(exercise.id, { name: "Renamed" }),
      "exercises.remove": (r) => r.exercises.remove(exercise.id),
      "exercises.search": (r) => r.exercises.search({ text: "x" }),
      "exercises.bySlug": (r) => r.exercises.bySlug("x2"),
      "exercises.recent": (r) => r.exercises.recent(3),
      "machineProfiles.get": (r) => r.machineProfiles.get(machine.id),
      "machineProfiles.list": (r) => r.machineProfiles.list(),
      "machineProfiles.create": (r) => r.machineProfiles.create({ name: "M2" }),
      "machineProfiles.update": (r) => r.machineProfiles.update(machine.id, { brand: "Hammer" }),
      "machineProfiles.remove": (r) => r.machineProfiles.remove(machine.id),
      "machineProfiles.forExercise": (r) => r.machineProfiles.forExercise(exercise.id),
      "machineProfiles.lastUsedFor": (r) => r.machineProfiles.lastUsedFor(exercise.id),
      "bodyMetrics.get": (r) => r.bodyMetrics.get(bm.id),
      "bodyMetrics.list": (r) => r.bodyMetrics.list(),
      "bodyMetrics.create": (r) => r.bodyMetrics.create({ measuredAt: "2026-10-13T07:00:00.000Z", localDate: "2026-10-13" }),
      "bodyMetrics.update": (r) => r.bodyMetrics.update(bm.id, { weightKg: 81 }),
      "bodyMetrics.remove": (r) => r.bodyMetrics.remove(bm.id),
      "bodyMetrics.inRange": (r) => r.bodyMetrics.inRange("2026-10-01", "2026-10-31"),
      "bodyMetrics.latest": (r) => r.bodyMetrics.latest(),
      "templates.get": (r) => r.templates.get(template.id),
      "templates.list": (r) => r.templates.list(),
      "templates.create": (r) => r.templates.create({ name: "T2", position: "a1" }),
      "templates.update": (r) => r.templates.update(template.id, { name: "T1" }),
      "templates.remove": (r) => r.templates.remove(template.id),
      "templates.exercisesOf": (r) => r.templates.exercisesOf(template.id),
      "templateExercises.get": (r) => r.templateExercises.get(te.id),
      "templateExercises.list": (r) => r.templateExercises.list(),
      "templateExercises.create": (r) => r.templateExercises.create({ templateId: template.id, exerciseId: exercise.id, position: "a1" }),
      "templateExercises.update": (r) => r.templateExercises.update(te.id, { workingSets: 4 }),
      "templateExercises.remove": (r) => r.templateExercises.remove(te.id),
      "workouts.get": (r) => r.workouts.get(workout.id),
      "workouts.list": (r) => r.workouts.list(),
      "workouts.create": (r) => r.workouts.create(workoutInput()),
      "workouts.update": (r) => r.workouts.update(workout.id, { title: "W" }),
      "workouts.remove": (r) => r.workouts.remove("0192a5b0-0005-7000-8000-0000000000ee"),
      "workouts.active": (r) => r.workouts.active(),
      "workouts.inRange": (r) => r.workouts.inRange("2026-10-01", "2026-10-31"),
      "workouts.finish": (r) => r.workouts.finish(workout.id),
      "workoutExercises.get": (r) => r.workoutExercises.get(we.id),
      "workoutExercises.list": (r) => r.workoutExercises.list(),
      "workoutExercises.create": (r) => r.workoutExercises.create({ workoutId: workout.id, exerciseId: exercise.id, position: "a1" }),
      "workoutExercises.update": (r) => r.workoutExercises.update(we.id, { notes: "n" }),
      "workoutExercises.remove": (r) => r.workoutExercises.remove("0192a5b0-0005-7000-8000-0000000000ef"),
      "workoutExercises.forWorkout": (r) => r.workoutExercises.forWorkout(workout.id),
      "sets.get": (r) => r.sets.get(set.id),
      "sets.list": (r) => r.sets.list(),
      "sets.create": (r) => r.sets.create({ workoutExerciseId: we.id, position: "a1", weightKg: 60, reps: 5 }),
      "sets.update": (r) => r.sets.update(set.id, { reps: 6 }),
      "sets.remove": (r) => r.sets.remove("0192a5b0-0005-7000-8000-0000000000f0"),
      "sets.forWorkoutExercise": (r) => r.sets.forWorkoutExercise(we.id),
      "sets.forWorkout": (r) => r.sets.forWorkout(workout.id),
      "sets.lastTime": (r) => r.sets.lastTime({ exerciseId: exercise.id, machineProfileId: null, beforeLocalDate: "2027-01-01" }),
      "catalog.version": (r) => r.catalog.version(),
      "catalog.replace": (r) => r.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [] }),
      transact: (r) => r.transact(async (tx) => tx.templates.list()),
    };
    expect(Object.keys(calls).sort()).toEqual(methodPaths(repo).sort());
    // Parents' removes run last: they cascade to the rows the other calls still need.
    const ordered = Object.entries(calls).sort(([a], [b]) => Number(a.endsWith(".remove")) - Number(b.endsWith(".remove")));
    for (const [path, call] of ordered) {
      await call(repo).catch((error: unknown) => {
        throw new Error(`${path} failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  });
});

describe("per-user isolation", () => {
  it("each user gets their own database; switching the active database switches what repo sees", async () => {
    const a = activateUserDb("alice");
    expect(a?.name).toBe("overload-alice");
    const repoA = createRepo(() => a as NonNullable<typeof a>);
    await repoA.templates.create({ name: "Alice's", position: "a0" });
    const b = activateUserDb("bob");
    expect(b?.name).toBe("overload-bob");
    const repoB = createRepo(() => b as NonNullable<typeof b>);
    expect(await repoB.templates.list()).toEqual([]);
    expect(await repoB.templates.create({ name: "Bob's", position: "a0" })).toBeTruthy();
    expect((await repoA.templates.list()).map((t) => t.name)).toEqual(["Alice's"]);
    expect((await repoB.templates.list()).map((t) => t.name)).toEqual(["Bob's"]);
    // reopening Alice's database later still has only her data
    closeUserDb("alice");
    const again = activateUserDb("alice") as NonNullable<ReturnType<typeof activateUserDb>>;
    expect((await createRepo(() => again).templates.list()).map((t) => t.name)).toEqual(["Alice's"]);
    expect(await again.outbox.count()).toBe(1);
  });
});
