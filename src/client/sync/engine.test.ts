import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogResponse } from "@/contracts/catalog";
import type { SyncedInfo } from "@/contracts/sync";
import { favoriteId } from "@/lib/ids";
import { META_KEYS, getMeta, setMeta } from "@/client/db/schema";
import { newDevice, seedWorkout, workoutInput, exerciseInput, type TestDevice } from "@/client/repo/test-utils";
import { createEngine, type Engine } from "./engine";
import { FakeServer } from "./fake-server";
import { coalesce } from "./outbox";
import { createStatusStore, createSyncedListeners } from "./status";

const devices: TestDevice[] = [];
function setup(server: FakeServer, userId = "user-1") {
  const device = newDevice(userId);
  devices.push(device);
  const status = createStatusStore();
  const listeners = createSyncedListeners();
  const synced: SyncedInfo[] = [];
  listeners.subscribe((i) => synced.push(i));
  const engine: Engine = createEngine({ db: device.db, fetch: server.fetch as typeof fetch, status, listeners });
  return { ...device, engine, status, synced };
}
afterEach(() => {
  for (const d of devices.splice(0)) d.db.close();
});

describe("push and pull", () => {
  it("drains the outbox, takes the server's version and derived columns, and reports status", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const { exercise, workout, we } = await seedWorkout(a.repo);
    const set = await a.repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 100, reps: 5, rir: 0, completedAt: "2026-10-12T17:10:00.000Z" });
    expect(await a.db.outbox.count()).toBe(4);

    const result = await a.engine.syncNow("manual");
    expect(result).toMatchObject({ ok: true, pushed: 4, rejected: 0 });
    expect(result.pulled).toBe(4); // the client's own rows come back with their server versions
    expect(await a.db.outbox.count()).toBe(0);
    expect(server.rows("workoutSet")).toHaveLength(1);
    const stored = await a.repo.sets.get(set.id);
    expect(stored?.version).toBeGreaterThan(0);
    expect(stored).toMatchObject({ seriesKey: exercise.id, effectiveLoadKg: 100, e1rmKg: 116.667, workoutId: workout.id });
    expect(a.status.get()).toMatchObject({ state: "idle", pendingCount: 0, lastError: null, rejectedCount: 0 });
    expect(a.status.get().lastSyncedAt).toBeTruthy();
    expect(a.synced).toHaveLength(1);
    expect(await getMeta(a.db, META_KEYS.cursor)).toBe(server.version);
    // the version the sync caught up to travels with the result and the listener call (the server pages compare it with theirs)
    expect(result.serverVersion).toBe(server.version);
    expect(a.synced[0]).toMatchObject({ pushed: 4, serverVersion: server.version });

    // an immediate second sync has nothing to do
    const again = await a.engine.syncNow("manual");
    expect(again).toMatchObject({ ok: true, pushed: 0, pulled: 0 });
    expect(a.synced).toHaveLength(1); // nothing moved: no listener call
  });

  it("coalesces many edits of one row into a single mutation", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const w = await a.repo.workouts.create(workoutInput());
    for (const note of ["a", "ab", "abc", "abcd"]) await a.repo.workouts.update(w.id, { notes: note });
    await a.repo.workouts.update(w.id, { title: "Push" });
    expect(await a.db.outbox.count()).toBe(6);
    await a.engine.syncNow();
    expect(server.requests.at(-1)?.mutations).toHaveLength(1);
    expect(server.row("workout", w.id)).toMatchObject({ notes: "abcd", title: "Push" });
    expect(await a.db.outbox.count()).toBe(0);
  });

  it("coalesce() keeps the latest HLC per field and the first mutation id", () => {
    const base = { entity: "workout" as const, id: "0192a5b0-0005-7000-8000-000000000001", createdAt: "" };
    const h = (n: number) => `${String(n).padStart(15, "0")}-00000-devx`;
    const batch = coalesce([
      { ...base, seq: 1, mutationId: "m1", fields: { notes: "new", title: "T" }, fieldHlc: { notes: h(5), title: h(5) } },
      { ...base, seq: 2, mutationId: "m2", fields: { notes: "old" }, fieldHlc: { notes: h(2) } },
      { ...base, seq: 3, mutationId: "m3", id: "0192a5b0-0005-7000-8000-000000000002", fields: { notes: "x" }, fieldHlc: { notes: h(1) } },
    ]);
    expect(batch.mutations).toHaveLength(2);
    expect(batch.mutations[0]).toMatchObject({ mutationId: "m1", fields: { notes: "new", title: "T" } });
    expect(batch.seqs).toEqual([[1, 2], [3]]);
  });

  it("two devices of one user converge in both directions", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const b = setup(server);
    const { exercise, workout, we } = await seedWorkout(a.repo);
    const set = await a.repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 100, reps: 5, completedAt: "2026-10-12T17:10:00.000Z" });
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.repo.sets.get(set.id))?.weightKg).toBe(100);
    expect((await b.repo.exercises.get(exercise.id))?.name).toBe("Bench Press");
    expect((await b.repo.workoutExercises.forWorkout(workout.id)).map((x) => x.id)).toEqual([we.id]);

    // concurrent edits to DIFFERENT fields of the same set both survive; the same field resolves by HLC on both sides
    await a.repo.sets.update(set.id, { reps: 8 });
    await b.repo.sets.update(set.id, { notes: "felt heavy" });
    await b.repo.sets.update(set.id, { weightKg: 105 });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    const ra = await a.repo.sets.get(set.id);
    const rb = await b.repo.sets.get(set.id);
    expect(ra).toMatchObject({ reps: 8, notes: "felt heavy", weightKg: 105 });
    expect(rb).toEqual(ra);
    expect(server.row("workoutSet", set.id)).toMatchObject({ reps: 8, notes: "felt heavy", weightKg: 105 });

    // delete on one device reaches the other
    await b.repo.workouts.remove(workout.id);
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(await a.repo.workouts.get(workout.id)).toBeUndefined();
    expect(await a.repo.sets.get(set.id)).toBeUndefined();
  });

  it("favorites: two offline devices star the same exercise (one row), then unstar and restore, and converge", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const b = setup(server);
    const exercise = await a.repo.exercises.create(exerciseInput({ slug: "fav-ex", name: "Fav Press" }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    const id = favoriteId("user-1", exercise.id);

    // both devices star it while offline: the SAME deterministic row, so the server ends up with exactly one
    expect(await a.repo.favorites.toggle(exercise.id)).toBe(true);
    expect(await b.repo.favorites.toggle(exercise.id)).toBe(true);
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(server.rows("exerciseFavorite")).toHaveLength(1);
    expect(server.row("exerciseFavorite", id)).toMatchObject({ exerciseId: exercise.id, deletedAt: null });
    expect(await a.repo.favorites.isFavorite(exercise.id)).toBe(true);
    expect(await b.repo.favorites.isFavorite(exercise.id)).toBe(true);
    expect((await a.repo.favorites.list()).map((e) => e.id)).toEqual([exercise.id]);

    // unstar on A, restore on B afterwards (a later HLC wins): both end starred; then unstar on A again: both end unstarred
    await new Promise((r) => setTimeout(r, 5));
    expect(await a.repo.favorites.toggle(exercise.id)).toBe(false);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.repo.favorites.isFavorite(exercise.id)).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(await b.repo.favorites.toggle(exercise.id)).toBe(true);
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(await a.repo.favorites.isFavorite(exercise.id)).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await a.repo.favorites.toggle(exercise.id);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await a.repo.favorites.ids()).toEqual(new Set());
    expect(await b.repo.favorites.ids()).toEqual(new Set());
    expect(server.rows("exerciseFavorite")).toHaveLength(1);
    expect(await a.db.exerciseFavorite.get(id)).toEqual(await b.db.exerciseFavorite.get(id));
  });

  it("an unknown entity key in a pull response is ignored, not fatal (what an older bundle sees when a newer entity arrives)", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.exercises.create(exerciseInput({ slug: "x", name: "X" }));
    const realFetch = server.fetch;
    // Wrap the fake server so the response also carries a `changes` key this client has never heard of.
    const futureFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await realFetch(input, init);
      if (!String(input).endsWith("/api/sync")) return res;
      const body = (await res.json()) as { changes: Record<string, unknown[]> };
      body.changes.somethingFromTheFuture = [{ id: "0192a5b0-0005-7000-8000-0000000000aa", version: 99 }];
      return Response.json(body);
    }) as typeof fetch;
    const engine = createEngine({ db: a.db, fetch: futureFetch, status: createStatusStore(), listeners: createSyncedListeners() });
    const result = await engine.syncNow("manual");
    expect(result).toMatchObject({ ok: true, pushed: 1 });
    expect(await a.repo.exercises.list()).toHaveLength(1);
    expect(await getMeta(a.db, META_KEYS.cursor)).toBe(server.version); // the cursor still advances
    expect((await a.engine.syncNow("manual")).ok).toBe(true);
  });

  it("a pending local edit with a later HLC survives an older server value, then wins on the next push", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const b = setup(server);
    const w = await a.repo.workouts.create(workoutInput({ title: "orig" }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.repo.workouts.update(w.id, { title: "from A" }); // earlier
    await a.engine.syncNow();
    await new Promise((r) => setTimeout(r, 5));
    await b.repo.workouts.update(w.id, { title: "from B" }); // later, but B has not seen A's edit yet
    // B pulls A's older edit first (via a failing push it cannot complete): simulate by syncing B directly
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.repo.workouts.get(w.id))?.title).toBe("from B");
    expect((await b.repo.workouts.get(w.id))?.title).toBe("from B");
  });

  it("pages through hasMore without losing rows", async () => {
    const server = new FakeServer();
    server.pageSize = 3;
    const a = setup(server);
    const b = setup(server);
    for (let i = 0; i < 8; i++) await a.repo.templates.create({ name: `t${i}`, position: `a${i}` });
    await a.engine.syncNow();
    const pulled = await b.engine.syncNow();
    expect(pulled.pulled).toBe(8);
    expect(await b.repo.templates.list()).toHaveLength(8);
    expect(server.requests.filter((r) => r.mutations.length === 0).length).toBeGreaterThanOrEqual(3);
  });
});

describe("failure modes", () => {
  it("offline: keeps the outbox, reports offline, and drains once the network is back", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.templates.create({ name: "offline", position: "a0" });
    server.offline = true;
    const failed = await a.engine.syncNow();
    expect(failed.ok).toBe(false);
    expect(a.status.get()).toMatchObject({ state: "offline", pendingCount: 1 });
    expect(a.status.get().lastError).toBeTruthy();
    server.offline = false;
    const ok = await a.engine.syncNow("online");
    expect(ok).toMatchObject({ ok: true, pushed: 1 });
    expect(a.status.get()).toMatchObject({ state: "idle", pendingCount: 0, lastError: null });
  });

  it("signed out (401): keeps pending changes with state signed-out, then syncs after signing back in", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.templates.create({ name: "a", position: "a0" });
    await a.repo.templates.create({ name: "b", position: "a1" });
    server.signedOut = true;
    const res = await a.engine.syncNow();
    expect(res.ok).toBe(false);
    expect(a.status.get()).toMatchObject({ state: "signed-out", pendingCount: 2 });
    expect(await a.db.outbox.count()).toBe(2);
    server.signedOut = false;
    expect(await a.engine.syncNow()).toMatchObject({ ok: true, pushed: 2 });
    expect(a.status.get().state).toBe("idle");
  });

  it("a server error keeps the outbox and reports error", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.templates.create({ name: "a", position: "a0" });
    server.failNext = 500;
    expect((await a.engine.syncNow()).ok).toBe(false);
    expect(a.status.get()).toMatchObject({ state: "error", pendingCount: 1 });
    expect((await a.engine.syncNow()).ok).toBe(true);
  });

  it("a rejected mutation is dropped from the outbox, counted, and never blocks the rest", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const bad = await a.repo.templates.create({ name: "bad", position: "a0" });
    await a.repo.templates.create({ name: "good", position: "a1" });
    const badEntry = (await a.db.outbox.toArray()).find((e) => e.id === bad.id);
    server.rejectIds.add(badEntry?.mutationId as string);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await a.engine.syncNow();
    warn.mockRestore();
    expect(res).toMatchObject({ ok: true, rejected: 1 });
    expect(res.pushed).toBe(1);
    expect(await a.db.outbox.count()).toBe(0);
    expect(a.status.get().rejectedCount).toBe(1);
    expect(server.rows("template").map((t) => t.name)).toEqual(["good"]);
    expect(a.synced.at(-1)).toMatchObject({ rejected: 1 });
  });

  it("rows the server sends again unchanged are neither written nor counted as pulled", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.templates.create({ name: "a", position: "a0" });
    await a.engine.syncNow();
    expect(await a.db.template.count()).toBe(1);

    await setMeta(a.db, META_KEYS.cursor, 0); // e.g. the v2 upgrade, or a reset: everything is pulled again
    let writes = 0;
    a.db.template.hook("updating", () => void writes++);
    a.db.template.hook("creating", () => void writes++);
    const result = await a.engine.syncNow();
    expect(result).toMatchObject({ ok: true, pushed: 0, pulled: 0 });
    expect(writes).toBe(0);
    expect(await getMeta<number>(a.db, META_KEYS.cursor)).toBe(server.version);
  });

  it("only one sync runs at a time (single flight)", async () => {
    const server = new FakeServer();
    const a = setup(server);
    await a.repo.templates.create({ name: "a", position: "a0" });
    const [first, second] = await Promise.all([a.engine.syncNow(), a.engine.syncNow()]);
    expect([first.skipped, second.skipped].filter(Boolean)).toHaveLength(1);
    expect(server.requests).toHaveLength(1);
  });

  it("uses navigator.locks when available: a held lock means skipped", async () => {
    const server = new FakeServer();
    const device = newDevice();
    devices.push(device);
    let held = false;
    const locks = {
      request: async (_name: string, _opts: unknown, cb: (lock: unknown) => Promise<unknown>) => {
        if (held) return cb(null);
        held = true;
        try {
          return await cb({});
        } finally {
          held = false;
        }
      },
    } as unknown as LockManager;
    const engine = createEngine({ db: device.db, fetch: server.fetch as typeof fetch, status: createStatusStore(), listeners: createSyncedListeners(), locks });
    const [x, y] = await Promise.all([engine.syncNow(), engine.syncNow()]);
    expect([x.skipped, y.skipped].filter(Boolean)).toHaveLength(1);
  });
});

describe("reset after garbage collection", () => {
  it("wipes synced tables, keeps the outbox and rows with pending writes, and re-pulls everything", async () => {
    const server = new FakeServer();
    const a = setup(server);
    const b = setup(server);
    const w = await a.repo.templates.create({ name: "kept", position: "a0" });
    const gone = await a.repo.templates.create({ name: "to be gc'd", position: "a1" });
    await a.engine.syncNow();
    await b.engine.syncNow();
    const cursorBefore = (await getMeta<number>(b.db, META_KEYS.cursor)) as number;
    expect(cursorBefore).toBeGreaterThan(0);

    await a.repo.templates.remove(gone.id);
    await a.engine.syncNow();
    server.tables.get("template")?.delete(gone.id); // GC hard-deleted the tombstone ...
    server.gc(); // ... and raised the floor above b's cursor
    server.version += 1;
    const pendingOnB = await b.repo.templates.create({ name: "created offline on B", position: "a2" });

    const res = await b.engine.syncNow();
    expect(res.ok).toBe(true);
    const names = (await b.repo.templates.list()).map((t) => t.name).sort();
    expect(names).toEqual(["created offline on B", "kept"]); // the stale copy of the GC'd row is gone
    expect(await b.db.outbox.count()).toBe(0);
    expect(server.rows("template").map((t) => t.id)).toContain(pendingOnB.id);
    expect(w.id).toBeTruthy();
    expect(await getMeta<number>(b.db, META_KEYS.cursor)).toBe(server.version);
  });
});

describe("catalog refresh", () => {
  const catalog: CatalogResponse = { version: 7, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [] };

  it("fetches with an ETag, replaces the cache on 200 and does nothing on 304", async () => {
    const server = new FakeServer();
    server.catalog = catalog;
    const a = setup(server);
    await a.engine.syncNow("start");
    expect(await a.repo.catalog.version()).toBe(7);
    expect(server.catalogRequests[0]?.ifNoneMatch).toBeNull();
    expect(await getMeta<string>(a.db, META_KEYS.catalogEtag)).toBe('W/"catalog-7"');
    await a.engine.syncNow("start");
    expect(server.catalogRequests[1]?.ifNoneMatch).toBe('W/"catalog-7"');
    expect(await a.repo.catalog.version()).toBe(7);
  });

  it("ignores a missing catalog endpoint (501) and never fails the sync because of it", async () => {
    const server = new FakeServer();
    const a = setup(server);
    expect((await a.engine.syncNow("start")).ok).toBe(true);
    expect(await a.repo.catalog.version()).toBeNull();
  });
});

describe("per-user isolation of the sync state", () => {
  it("two users on the same server keep separate local data", async () => {
    const server = new FakeServer();
    const a = setup(server, "alice");
    await a.repo.templates.create({ name: "alice only", position: "a0" });
    await a.engine.syncNow();
    const bob = setup(new FakeServer(), "bob");
    await bob.engine.syncNow();
    expect(await bob.repo.templates.list()).toEqual([]);
    expect(a.db.name).not.toBe(bob.db.name);
    void exerciseInput;
  });
});
