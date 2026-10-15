import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { ExerciseRow } from "@/contracts/entities";
import { RepoError } from "@/contracts/repo";
import { catalogExerciseId, favoriteId } from "@/lib/ids";
import { HLC_REGEX } from "@/contracts/sync";
import { resetAllDbs } from "@/client/db/active";
import { exerciseInput, newDevice, type TestDevice } from "./test-utils";

let device: TestDevice;
const fresh = (userId = "user-1") => (device = newDevice(userId));
afterEach(async () => {
  device?.db.close();
  await resetAllDbs();
});
const outbox = () => device.db.outbox.orderBy("seq").toArray();

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

async function withCatalog() {
  const { repo } = fresh();
  const squat = catalogRow("Barbell_Squat");
  const press = catalogRow("Incline_Dumbbell_Press", { equipment: "DUMBBELL" });
  const curl = catalogRow("Cable_Curl", { modality: "CABLE", equipment: "CABLE" });
  await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [squat, press, curl] });
  return { repo, squat, press, curl };
}

describe("favorites", () => {
  it("starring creates ONE row under the deterministic id and enqueues one mutation", async () => {
    const { repo, squat } = await withCatalog();
    expect(await repo.favorites.isFavorite(squat.id)).toBe(false);
    expect(await repo.favorites.toggle(squat.id)).toBe(true);
    const id = favoriteId("user-1", squat.id);
    const row = await device.db.exerciseFavorite.get(id);
    expect(row).toMatchObject({ id, exerciseId: squat.id, deletedAt: null, version: 0 });
    expect(row?.hlc).toMatch(HLC_REGEX);
    expect(Object.keys(row?.fieldHlc ?? {}).sort()).toEqual(["exerciseId", "position"]);
    const queue = await outbox();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ entity: "exerciseFavorite", id, fields: { exerciseId: squat.id } });
    expect(Object.keys(queue[0]?.fields ?? {}).sort()).toEqual(["exerciseId", "position"]);
    expect(await repo.favorites.isFavorite(squat.id)).toBe(true);
    expect(await repo.favorites.ids()).toEqual(new Set([squat.id]));
  });

  it("unstarring tombstones the row; starring again restores it with a newer HLC (same row, same position)", async () => {
    const { repo, squat } = await withCatalog();
    const id = favoriteId("user-1", squat.id);
    await repo.favorites.toggle(squat.id);
    const starred = await device.db.exerciseFavorite.get(id);
    expect(await repo.favorites.toggle(squat.id)).toBe(false);
    const unstarred = await device.db.exerciseFavorite.get(id);
    expect(unstarred?.deletedAt).toBeTruthy();
    expect((unstarred?.fieldHlc.deletedAt ?? "") > (starred?.fieldHlc.exerciseId ?? "")).toBe(true);
    expect(await repo.favorites.isFavorite(squat.id)).toBe(false);
    expect(await repo.favorites.list()).toEqual([]);
    expect(await repo.favorites.ids()).toEqual(new Set());

    expect(await repo.favorites.toggle(squat.id)).toBe(true);
    const restored = await device.db.exerciseFavorite.get(id);
    expect(restored).toMatchObject({ id, deletedAt: null, position: starred?.position });
    expect((restored?.fieldHlc.deletedAt ?? "") > (unstarred?.fieldHlc.deletedAt ?? "")).toBe(true);
    expect(await device.db.exerciseFavorite.count()).toBe(1);
    const queue = await outbox();
    expect(queue.map((q) => Object.keys(q.fields).sort().join(","))).toEqual(["exerciseId,position", "deletedAt", "deletedAt"]);
    expect(queue[2]?.fields).toEqual({ deletedAt: null });
  });

  it("list returns the starred exercises in the order they were starred; ids/isFavorite agree", async () => {
    const { repo, squat, press, curl } = await withCatalog();
    for (const e of [press, curl, squat]) await repo.favorites.toggle(e.id);
    expect((await repo.favorites.list()).map((e) => e.name)).toEqual(["Incline Dumbbell Press", "Cable Curl", "Barbell Squat"]);
    await repo.favorites.toggle(curl.id);
    expect((await repo.favorites.list()).map((e) => e.name)).toEqual(["Incline Dumbbell Press", "Barbell Squat"]);
    expect(await repo.favorites.ids()).toEqual(new Set([press.id, squat.id]));
    await repo.favorites.toggle(curl.id); // restored: keeps its old slot (between the other two)
    expect((await repo.favorites.list()).map((e) => e.name)).toEqual(["Incline Dumbbell Press", "Cable Curl", "Barbell Squat"]);
  });

  it("works for the user's own custom exercises, and hides a favorite whose exercise was deleted", async () => {
    const { repo } = await withCatalog();
    const mine = await repo.exercises.create(exerciseInput({ slug: "mine", name: "Pause Bench" }));
    await repo.favorites.toggle(mine.id);
    expect((await repo.favorites.list()).map((e) => e.id)).toEqual([mine.id]);
    await repo.exercises.remove(mine.id);
    expect(await repo.favorites.list()).toEqual([]); // the favorite row stays (it can come back), the list hides it
    expect(await repo.favorites.isFavorite(mine.id)).toBe(true);
  });

  it("refuses to star an exercise that does not exist locally", async () => {
    const { repo } = await withCatalog();
    const error = await repo.favorites.toggle("0192a5b0-0005-7000-8000-0000000000aa").then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(RepoError);
    expect((error as RepoError).code).toBe("NOT_FOUND");
    expect(await outbox()).toHaveLength(0);
  });

  it("the favorite id is per user: another user's database derives another id", async () => {
    const { repo, squat } = await withCatalog();
    await repo.favorites.toggle(squat.id);
    device.db.close();
    const other = newDevice("user-2");
    await other.repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [squat] });
    await other.repo.favorites.toggle(squat.id);
    expect(await other.db.exerciseFavorite.get(favoriteId("user-2", squat.id))).toBeTruthy();
    expect(await other.db.exerciseFavorite.get(favoriteId("user-1", squat.id))).toBeUndefined();
    other.db.close();
  });

  it("is atomic inside repo.transact together with other writes", async () => {
    const { repo, squat } = await withCatalog();
    await expect(
      repo.transact(async (tx) => {
        await tx.favorites.toggle(squat.id);
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await device.db.exerciseFavorite.count()).toBe(0);
    expect(await outbox()).toHaveLength(0);
  });
});

describe("search ranks favorites first among equal matches", () => {
  it("passes the user's favorites to the shared search", async () => {
    const { repo } = fresh();
    const a = catalogRow("Aaa_Curl");
    const b = catalogRow("Bbb_Curl");
    const c = catalogRow("Ccc_Curl");
    await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [a, b, c] });
    expect((await repo.exercises.search({ text: "curl" })).map((e) => e.name)).toEqual(["Aaa Curl", "Bbb Curl", "Ccc Curl"]);
    await repo.favorites.toggle(c.id);
    expect((await repo.exercises.search({ text: "curl" })).map((e) => e.name)).toEqual(["Ccc Curl", "Aaa Curl", "Bbb Curl"]);
    // an empty query is unchanged behaviour: filters only, name order, no favorite boost
    expect((await repo.exercises.search({})).map((e) => e.name)).toEqual(["Aaa Curl", "Bbb Curl", "Ccc Curl"]);
  });
});
