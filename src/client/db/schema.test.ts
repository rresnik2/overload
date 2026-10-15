import "fake-indexeddb/auto";
import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { META_KEYS, OverloadDb, getMeta } from "./schema";

// The stores of RELEASED version 1, copied here on purpose: an upgrade test must not depend on the current schema.
const V1_STORES = {
  exercise: "id, slug, version",
  catalog: "id, slug",
  machineProfile: "id, exerciseId",
  bodyMetric: "id, localDate, measuredAt",
  template: "id",
  templateExercise: "id, templateId",
  workout: "id, localDate, startedAt",
  workoutExercise: "id, workoutId, exerciseId",
  workoutSet: "id, workoutExerciseId, workoutId, machineProfileId, exerciseId, seriesKey",
  outbox: "++seq, mutationId, [entity+id]",
  meta: "key",
};

let open: Dexie | null = null;
afterEach(() => {
  open?.close();
  open = null;
});

describe("Dexie migrations", () => {
  it("v1 -> v2 adds the exerciseFavorite table, keeps every existing row and the outbox, and re-pulls once (cursor 0)", async () => {
    const options = { indexedDB: new IDBFactory(), IDBKeyRange };
    const v1 = new Dexie("overload-user-1", options);
    v1.version(1).stores(V1_STORES);
    await v1.open();
    await v1.table("workout").put({ id: "w1", localDate: "2026-10-12", startedAt: "2026-10-12T17:00:00.000Z", title: "Push", fieldHlc: {}, hlc: "h1", version: 3, deletedAt: null });
    await v1.table("exercise").put({ id: "e1", slug: "mine", name: "Mine", version: 2, deletedAt: null });
    await v1.table("catalog").put({ id: "c1", slug: "barbell-squat", name: "Barbell Squat" });
    await v1.table("outbox").add({ mutationId: "m1", entity: "workout", id: "w1", fields: { title: "Push" }, fieldHlc: { title: "h1" }, createdAt: "2026-10-12T17:00:01.000Z" });
    await v1.table("meta").bulkPut([
      { key: META_KEYS.cursor, value: 57 },
      { key: META_KEYS.deviceId, value: "dev123" },
      { key: META_KEYS.catalogVersion, value: 4 },
    ]);
    expect(v1.verno).toBe(1);
    v1.close();

    const db = new OverloadDb("user-1", options);
    open = db;
    await db.open();
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name)).toContain("exerciseFavorite");
    expect(await db.exerciseFavorite.count()).toBe(0);

    // existing data survived
    expect(await db.workout.get("w1")).toMatchObject({ title: "Push", version: 3 });
    expect(await db.exercise.get("e1")).toMatchObject({ name: "Mine" });
    expect(await db.catalog.get("c1")).toMatchObject({ name: "Barbell Squat" });
    expect(await db.outbox.count()).toBe(1);
    expect(await db.outbox.get(1)).toMatchObject({ mutationId: "m1", entity: "workout" });
    expect(await getMeta(db, META_KEYS.deviceId)).toBe("dev123");
    expect(await getMeta(db, META_KEYS.catalogVersion)).toBe(4);
    // favorites written by another device while this one ran the old bundle are pulled again
    expect(await getMeta(db, META_KEYS.cursor)).toBe(0);

    // the new table is usable, indexed by exerciseId
    await db.exerciseFavorite.put({ id: "f1", exerciseId: "e1", position: "a0", hlc: "h", fieldHlc: {}, version: 0, deletedAt: null, createdAt: "x", updatedAt: "x" });
    expect((await db.exerciseFavorite.where("exerciseId").equals("e1").toArray()).map((f) => f.id)).toEqual(["f1"]);
    expect(db.syncedTables.map((t) => t.name)).toContain("exerciseFavorite");
  });

  it("a brand-new database starts at the latest version without running the upgrade (cursor stays unset)", async () => {
    const db = new OverloadDb("user-9", { indexedDB: new IDBFactory(), IDBKeyRange });
    open = db;
    await db.open();
    expect(db.verno).toBe(2);
    expect(await getMeta(db, META_KEYS.cursor)).toBeUndefined();
  });

  it("opening v2 again is a no-op (data and cursor untouched)", async () => {
    const options = { indexedDB: new IDBFactory(), IDBKeyRange };
    const first = new OverloadDb("user-1", options);
    await first.open();
    await first.meta.put({ key: META_KEYS.cursor, value: 12 });
    first.close();
    const second = new OverloadDb("user-1", options);
    open = second;
    await second.open();
    expect(await getMeta(second, META_KEYS.cursor)).toBe(12);
  });
});
