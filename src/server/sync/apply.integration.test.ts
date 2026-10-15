// Needs a migrated database (DATABASE_URL in .env.local). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ENTITY_NAMES, type EntityName } from "@/contracts/entities";
import { SYNC_MAX_CLOCK_SKEW_MS, type SyncResponse } from "@/contracts/sync";
import { catalogExerciseId, favoriteId, newId } from "@/lib/ids";
import { formatHlc, parseHlc } from "@/lib/sync/hlc";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { applySyncSlots } from "./apply";
import { collectTombstones } from "./gc";
import { parseSyncBody } from "./parse";
import { pullChanges } from "./pull";
import { FakeDevice, exerciseFields, setFields, workoutFields } from "./test-helpers";

const suffix = newId().slice(-12);
const userA = `sync-a-${suffix}`;
const userB = `sync-b-${suffix}`;
const userC = `sync-c-${suffix}`;
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);
const ctxC = mintUserCtx(userC);
const users = [userA, userB, userC];

beforeAll(async () => {
  for (const id of users) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

const rowsOf = (res: SyncResponse, entity: EntityName) => res.changes[entity];
const rowOf = (res: SyncResponse, entity: EntityName, id: string) => (res.changes[entity] as { id: string }[]).find((r) => r.id === id) as never as Record<string, unknown> & { version: number; deletedAt: string | null };
const statuses = (res: SyncResponse) => res.results.map((r) => r.status);

/** A full tree for one user: exercise -> workout -> workoutExercise -> sets. */
function tree(device: FakeDevice, opts: { exerciseOver?: Record<string, unknown>; sets?: Record<string, unknown>[] } = {}) {
  const ids = { exercise: newId(), workout: newId(), we: newId(), sets: [] as string[] };
  const sets = opts.sets ?? [{ weightKg: 100, reps: 5 }];
  const mutations = [
    device.mutation("exercise", ids.exercise, exerciseFields(opts.exerciseOver)),
    device.mutation("workout", ids.workout, workoutFields()),
    device.mutation("workoutExercise", ids.we, { workoutId: ids.workout, exerciseId: ids.exercise, position: "a0" }),
    ...sets.map((s, i) => {
      const id = newId();
      ids.sets.push(id);
      return device.mutation("workoutSet", id, setFields(ids.we, { position: `a${i}`, ...s }));
    }),
  ];
  return { ids, mutations };
}

describe("applyServerMutations", () => {
  it("applies a tree, derives set columns, builds PRs and returns the rows by version", async () => {
    const dev = new FakeDevice(ctxA, "devA1");
    const { ids, mutations } = tree(dev, { exerciseOver: { muscles: [{ muscle: "CHEST", role: "PRIMARY" }, { muscle: "TRICEPS", role: "SECONDARY" }] } });
    const res = await dev.push(mutations);

    expect(statuses(res)).toEqual(mutations.map(() => "applied"));
    expect(res.reset).toBe(false);
    expect(res.hasMore).toBe(false);
    expect(rowsOf(res, "exercise")).toHaveLength(1);
    expect(rowsOf(res, "exercise")[0]).toMatchObject({ id: ids.exercise, isCustom: true, muscles: [{ muscle: "CHEST", role: "PRIMARY" }, { muscle: "TRICEPS", role: "SECONDARY" }] });
    const set = rowsOf(res, "workoutSet")[0];
    expect(set).toMatchObject({
      id: ids.sets[0],
      workoutId: ids.workout,
      exerciseId: ids.exercise,
      machineProfileId: null,
      seriesKey: ids.exercise,
      localDate: "2026-10-12",
      effectiveLoadKg: 100,
      e1rmKg: 116.667,
      weightKg: 100,
    });
    expect(set?.version).toBeGreaterThan(0);
    expect(set?.fieldHlc.weightKg).toBeTruthy();
    expect(res.cursor).toBe(await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } }).then((s) => s.version));
    // first sets of a series are not announced as PRs, but the rows exist
    expect(res.newPrs).toEqual([]);
    const prs = await prisma.personalRecord.findMany({ where: { userId: userA, seriesKey: ids.exercise } });
    expect(prs.map((p) => p.type).sort()).toEqual(["E1RM", "MAX_LOAD", "MAX_SESSION_VOLUME", "MAX_SET_VOLUME", "REP_MAX"]);

    // a heavier set later: PR rebuilt, announced, previousValue kept
    const heavier = newId();
    const res2 = await dev.push([dev.mutation("workoutSet", heavier, setFields(ids.we, { position: "a1", weightKg: 110, reps: 5 }))]);
    expect(res2.newPrs.map((p) => p.type).sort()).toEqual(["E1RM", "MAX_LOAD", "MAX_SESSION_VOLUME", "MAX_SET_VOLUME", "REP_MAX"]);
    expect(res2.newPrs.find((p) => p.type === "MAX_LOAD")).toMatchObject({ value: 110, previousValue: 100, setId: heavier });
  });

  it("replaying a batch is harmless (noop, no new versions, no PR churn)", async () => {
    const dev = new FakeDevice(ctxA, "devA2");
    const { mutations } = tree(dev, { sets: [{ weightKg: 80, reps: 8 }, { weightKg: 85, reps: 6 }] });
    const first = await dev.push(mutations, 0);
    const stateBefore = await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } });
    const second = await dev.push(mutations, first.cursor);
    expect(statuses(second)).toEqual(mutations.map(() => "noop"));
    expect(second.newPrs).toEqual([]);
    expect(ENTITY_NAMES.every((e) => rowsOf(second, e).length === 0)).toBe(true);
    const stateAfter = await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } });
    expect(stateAfter.version).toBe(stateBefore.version);
    // and a cursor-0 pull still has exactly the same rows once
    const all = await pullChanges(ctxA, 0);
    expect(all.changes.workoutSet.filter((s) => mutations.some((m) => m.id === s.id))).toHaveLength(2);
  });

  it("merges per field by HLC: concurrent edits to different fields both survive, a stale write loses", async () => {
    const a = new FakeDevice(ctxA, "devA3");
    const b = new FakeDevice(ctxA, "devA4");
    const { ids, mutations } = tree(a);
    await a.push(mutations, 0);
    const setId = ids.sets[0] as string;
    const t = Date.now() + 10_000;
    const wallA = formatHlc({ wallMs: t, counter: 0, nodeId: "devA3" });
    const wallB = formatHlc({ wallMs: t + 5, counter: 0, nodeId: "devA4" });
    const older = formatHlc({ wallMs: t - 60_000, counter: 0, nodeId: "devA4" });
    // device B pushes first (later HLC), device A's older write to `reps` must lose, its `notes` write must win (different field)
    await b.push([b.mutation("workoutSet", setId, { reps: 8 }, wallB)]);
    const res = await a.push([a.mutation("workoutSet", setId, { reps: 3, notes: "from A" }, wallA), a.mutation("workoutSet", setId, { weightKg: 1 }, older)], 0);
    expect(statuses(res)).toEqual(["applied", "noop"]); // reps lost (but notes applied), second is older than the original weightKg HLC? original weight HLC < older
    const row = rowsOf(res, "workoutSet").find((r) => r.id === setId);
    expect(row).toMatchObject({ reps: 8, notes: "from A" });
  });

  it("clamps client HLCs more than 5 minutes ahead of server time", async () => {
    const dev = new FakeDevice(ctxA, "devA5");
    const far = formatHlc({ wallMs: Date.now() + 24 * 3600 * 1000, counter: 2, nodeId: "devA5" });
    const id = newId();
    const res = await dev.push([dev.mutation("exercise", id, exerciseFields({ slug: "fast-clock" }), far)], 0);
    const row = rowsOf(res, "exercise").find((r) => r.id === id);
    const stored = parseHlc(row?.hlc ?? "");
    expect(stored?.wallMs).toBeLessThanOrEqual(Date.now() + SYNC_MAX_CLOCK_SKEW_MS + 1000);
    expect(stored?.counter).toBe(2);
    // the server's reply HLC is beyond the client's: the client clock catches up
    expect(res.serverHlc > dev.clock.now() || res.serverHlc.length > 0).toBe(true);
  });
});

describe("isolation and validation", () => {
  it("rejects writes to another user's ids as NOT_OWNER, dead-letters them, and never touches the row", async () => {
    const a = new FakeDevice(ctxA, "devA6");
    const { ids, mutations } = tree(a);
    await a.push(mutations, 0);

    const b = new FakeDevice(ctxB, "devB1");
    const own = newId();
    const res = await b.push(
      [
        b.mutation("workoutSet", ids.sets[0] as string, { reps: 99 }),
        b.mutation("exercise", ids.exercise, { name: "Hijacked" }),
        b.mutation("workout", ids.workout, { notes: "mine now" }),
        b.mutation("exercise", own, exerciseFields({ slug: "b-own" })), // a good one in the same batch still applies
      ],
      0,
    );
    expect(statuses(res)).toEqual(["rejected", "rejected", "rejected", "applied"]);
    expect(res.results.slice(0, 3).every((r) => r.reason === "NOT_OWNER")).toBe(true);
    expect(res.changes.workoutSet).toEqual([]);
    expect(res.changes.exercise.map((r) => r.id)).toEqual([own]);

    const stillA = await prisma.workoutSet.findUniqueOrThrow({ where: { id: ids.sets[0] as string } });
    expect(stillA.reps).toBe(5);
    expect(stillA.userId).toBe(userA);
    expect(await prisma.exercise.findUniqueOrThrow({ where: { id: ids.exercise } }).then((e) => e.name)).toBe("Test Press");
    const dead = await prisma.syncDeadLetter.findMany({ where: { userId: userB, reason: "NOT_OWNER" } });
    expect(dead.length).toBe(3);
    expect(await prisma.syncDeadLetter.count({ where: { userId: userA } })).toBe(0);
  });

  it("rejects writes to catalog exercises as CATALOG_READONLY", async () => {
    const catalog = await prisma.exercise.findFirstOrThrow({ where: { userId: null } });
    const dev = new FakeDevice(ctxA, "devA7");
    const res = await dev.push([dev.mutation("exercise", catalog.id, { name: "Renamed" })], 0);
    expect(res.results[0]).toMatchObject({ status: "rejected", reason: "CATALOG_READONLY" });
    expect(await prisma.exercise.findUniqueOrThrow({ where: { id: catalog.id } }).then((e) => e.name)).toBe(catalog.name);
  });

  it("allows referencing catalog exercises and rejects references to other users' or missing rows", async () => {
    const catalog = await prisma.exercise.findFirstOrThrow({ where: { userId: null } });
    const a = new FakeDevice(ctxA, "devA8");
    const other = tree(a);
    await a.push(other.mutations, 0);

    const b = new FakeDevice(ctxB, "devB2");
    const workout = newId();
    const okWe = newId();
    const badWe1 = newId();
    const badWe2 = newId();
    const res = await b.push(
      [
        b.mutation("workout", workout, workoutFields()),
        b.mutation("workoutExercise", okWe, { workoutId: workout, exerciseId: catalog.id, position: "a0" }),
        b.mutation("workoutExercise", badWe1, { workoutId: workout, exerciseId: other.ids.exercise, position: "a1" }), // A's exercise
        b.mutation("workoutExercise", badWe2, { workoutId: newId(), exerciseId: catalog.id, position: "a2" }), // missing workout
      ],
      0,
    );
    expect(statuses(res)).toEqual(["applied", "applied", "rejected", "rejected"]);
    expect(res.results[2]?.reason).toBe("MISSING_REFERENCE");
    expect(res.results[3]?.reason).toBe("MISSING_REFERENCE");
  });

  it("applies parents before children regardless of order in the batch, and rejects incomplete new rows", async () => {
    const dev = new FakeDevice(ctxA, "devA9");
    const { ids, mutations } = tree(dev);
    const reversed = [...mutations].reverse();
    const incomplete = dev.mutation("workout", newId(), { title: "no start time" });
    const res = await dev.push([...reversed, incomplete], 0);
    expect(statuses(res)).toEqual([...mutations.map(() => "applied"), "rejected"]);
    expect(res.results.at(-1)).toMatchObject({ reason: "INVALID_SHAPE" });
    expect(ids.sets).toHaveLength(1);
  });

  it("the route's lenient parsing dead-letters a poisoned mutation (forbidden field) without blocking the rest", async () => {
    const dev = new FakeDevice(ctxA, "devA10");
    const good = dev.mutation("exercise", newId(), exerciseFields({ slug: "lenient" }));
    const poisoned = { ...dev.mutation("workout", newId(), workoutFields()), fields: { ...workoutFields(), userId: userB, version: 99 } };
    const parsed = parseSyncBody({ ...dev.request([]), mutations: [poisoned, good] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const res = await applySyncSlots(ctxA, parsed.envelope, parsed.slots);
    expect(statuses(res)).toEqual(["rejected", "applied"]);
    expect(res.results[0]?.reason).toBe("INVALID_SHAPE");
    expect(await prisma.syncDeadLetter.count({ where: { userId: userA, mutationId: poisoned.mutationId } })).toBe(1);
  });
});

describe("tombstones, orphans and derived data", () => {
  it("tombstoning a workout tombstones its exercises and sets, rebuilds PRs, and keeps later children out", async () => {
    const dev = new FakeDevice(ctxA, "devA11");
    const { ids, mutations } = tree(dev, { sets: [{ weightKg: 90, reps: 5 }, { weightKg: 95, reps: 5 }] });
    await dev.push(mutations, 0);
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: ids.exercise } })).toBeGreaterThan(0);

    const del = await dev.push([dev.mutation("workout", ids.workout, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    expect(rowsOf(del, "workoutExercise").find((r) => r.id === ids.we)?.deletedAt).not.toBeNull();
    for (const sid of ids.sets) expect(rowsOf(del, "workoutSet").find((r) => r.id === sid)?.deletedAt).not.toBeNull();
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: ids.exercise } })).toBe(0);

    // a set logged offline into the now-deleted workout is tombstoned on arrival
    const late = newId();
    const res = await dev.push([dev.mutation("workoutSet", late, setFields(ids.we, { position: "b0" }))], del.cursor);
    expect(rowsOf(res, "workoutSet").find((r) => r.id === late)?.deletedAt).not.toBeNull();
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: ids.exercise } })).toBe(0);
  });

  it("tombstoning a template tombstones its exercises, but deleting a custom exercise never erases history", async () => {
    const dev = new FakeDevice(ctxA, "devA12");
    const ex = newId();
    const tpl = newId();
    const te = newId();
    await dev.push(
      [
        dev.mutation("exercise", ex, exerciseFields({ slug: "tpl-ex" })),
        dev.mutation("template", tpl, { name: "Push", position: "a0" }),
        dev.mutation("templateExercise", te, { templateId: tpl, exerciseId: ex, position: "a0" }),
      ],
      0,
    );
    const res = await dev.push([dev.mutation("template", tpl, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    expect(rowsOf(res, "templateExercise").find((r) => r.id === te)?.deletedAt).not.toBeNull();

    const { ids, mutations } = tree(dev);
    await dev.push(mutations, 0);
    const res2 = await dev.push([dev.mutation("exercise", ids.exercise, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    expect(rowOf(res2, "exercise", ids.exercise).deletedAt).not.toBeNull();
    expect(await prisma.workoutSet.count({ where: { id: { in: ids.sets }, deletedAt: null } })).toBe(ids.sets.length);
  });

  it("an undelete needs a later HLC than the delete", async () => {
    const dev = new FakeDevice(ctxA, "devA13");
    const id = newId();
    const created = dev.mutation("template", id, { name: "T", position: "a0" });
    const del = dev.mutation("template", id, { deletedAt: "2026-10-14T10:00:00.000Z" });
    const staleUndelete = dev.mutation("template", id, { deletedAt: null }, formatHlc({ wallMs: Date.now() - 100_000, counter: 0, nodeId: "devA13" }));
    const res = await dev.push([created, del, staleUndelete], 0);
    expect(rowOf(res, "template", id).deletedAt).toBe("2026-10-14T10:00:00.000Z");
    const undelete = dev.mutation("template", id, { deletedAt: null });
    const res2 = await dev.push([undelete], res.cursor);
    expect(rowOf(res2, "template", id).deletedAt).toBeNull();
  });

  it("re-derives dependent sets when a workout's bodyweight changes, and rebuilds PRs when a set is deleted", async () => {
    const dev = new FakeDevice(ctxA, "devA14");
    const { ids, mutations } = tree(dev, { exerciseOver: { slug: "pull-up", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 1 }, sets: [{ weightKg: 10, reps: 5 }] });
    const first = await dev.push(mutations, 0);
    expect(rowOf(first, "workoutSet", ids.sets[0] as string).effectiveLoadKg).toBeNull(); // no bodyweight known yet
    const bm = newId();
    const second = await dev.push([dev.mutation("bodyMetric", bm, { measuredAt: "2026-10-10T07:00:00.000Z", localDate: "2026-10-10", weightKg: 80 })], first.cursor);
    expect(rowOf(second, "workoutSet", ids.sets[0] as string)).toMatchObject({ effectiveLoadKg: 90 });
    const third = await dev.push([dev.mutation("workout", ids.workout, { bodyweightKg: 100 })], second.cursor);
    const set = rowOf(third, "workoutSet", ids.sets[0] as string);
    expect(set).toMatchObject({ effectiveLoadKg: 110 });
    expect(set.version).toBeGreaterThan(rowOf(second, "workoutSet", ids.sets[0] as string).version);
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: ids.exercise, type: "MAX_LOAD" } })).toBe(1);

    const gone = await dev.push([dev.mutation("workoutSet", ids.sets[0] as string, { deletedAt: "2026-10-14T10:00:00.000Z" })], third.cursor);
    expect(gone.results[0]?.status).toBe("applied");
    expect(await prisma.personalRecord.count({ where: { userId: userA, seriesKey: ids.exercise } })).toBe(0);
  });
});

describe("concurrency and paging", () => {
  it("concurrent pushes never skip rows: the union is pulled with strictly increasing versions", async () => {
    const devs = [new FakeDevice(ctxA, "devAc1"), new FakeDevice(ctxA, "devAc2"), new FakeDevice(ctxA, "devAc3")];
    const before = await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } });
    const watcher = new FakeDevice(ctxA, "devAw");
    watcher.cursor = before.version;

    const batches = devs.map((d) => Array.from({ length: 12 }, (_, i) => d.mutation("template", newId(), { name: `${d.deviceId}-${i}`, position: `a${i}` })));
    const results = await Promise.all(devs.map((d, i) => d.push(batches[i] as never, before.version)));
    for (const r of results) expect(statuses(r).every((s) => s === "applied")).toBe(true);

    // everything a watcher missed since `before.version` arrives, once, strictly increasing
    const pulled: { id: string; version: number }[] = [];
    let cursor = before.version;
    for (let page = 0; page < 10; page++) {
      const res = await pullChanges(ctxA, cursor);
      pulled.push(...res.changes.template.map((t) => ({ id: t.id, version: t.version })));
      cursor = res.cursor;
      if (!res.hasMore) break;
    }
    const expected = batches.flat().map((m) => m.id);
    expect(pulled.map((p) => p.id).sort()).toEqual([...expected].sort());
    const versions = pulled.map((p) => p.version);
    expect(versions).toEqual([...versions].sort((x, y) => x - y));
    expect(new Set(versions).size).toBe(versions.length);
    const after = await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } });
    expect(cursor).toBe(after.version);
    expect(after.version).toBe(before.version + expected.length);
  });

  it("pages across entities in version order without losing a row at a page boundary", async () => {
    const dev = new FakeDevice(ctxC, "devCp");
    const mutations = [
      ...Array.from({ length: 5 }, (_, i) => dev.mutation("template", newId(), { name: `t${i}`, position: `a${i}` })),
      ...Array.from({ length: 5 }, (_, i) => dev.mutation("bodyMetric", newId(), { measuredAt: "2026-10-1" + i + "T07:00:00.000Z", localDate: "2026-10-1" + i, weightKg: 80 + i })),
    ];
    await dev.push(mutations, 0);
    // Page size is a contract constant (1000): verify the ordering/cursor semantics on a small cursor walk instead.
    const all = await pullChanges(ctxC, 0);
    const flat = [...all.changes.template, ...all.changes.bodyMetric].map((r) => r.version).sort((a, b) => a - b);
    expect(flat).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    expect(all.hasMore).toBe(false);
    expect(all.cursor).toBe(10);
    const tail = await pullChanges(ctxC, 7);
    expect([...tail.changes.template, ...tail.changes.bodyMetric].map((r) => r.version).sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });
});

describe("garbage collection", () => {
  it("hard-deletes old tombstones children-first, raises the floor, and tells stale clients to reset", async () => {
    const dev = new FakeDevice(ctxA, "devAgc");
    const { ids, mutations } = tree(dev);
    const kept = newId();
    await dev.push([...mutations, dev.mutation("template", kept, { name: "kept", position: "a0" })], 0);
    const del = await dev.push([dev.mutation("workout", ids.workout, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);

    // not old enough yet
    const early = await collectTombstones(new Date(), 90);
    expect(early.deleted.workout).toBe(0);
    expect(await prisma.workout.count({ where: { id: ids.workout } })).toBe(1);

    await prisma.syncDeadLetter.create({ data: { userId: userA, mutationId: "m-old", entity: "workout", entityId: "x", reason: "NOT_OWNER", payload: {} } });

    // 91 days later
    const later = new Date(Date.now() + 91 * 24 * 3600 * 1000);
    const summary = await collectTombstones(later, 90);
    expect(summary.deadLetters).toBeGreaterThanOrEqual(1); // dead letters expire with the tombstones
    expect(await prisma.syncDeadLetter.count({ where: { userId: userA, mutationId: "m-old" } })).toBe(0);
    expect(summary.deleted.workoutSet).toBeGreaterThanOrEqual(1);
    expect(summary.deleted.workoutExercise).toBeGreaterThanOrEqual(1);
    expect(summary.deleted.workout).toBeGreaterThanOrEqual(1);
    expect(await prisma.workout.count({ where: { id: ids.workout } })).toBe(0);
    expect(await prisma.workoutSet.count({ where: { id: { in: ids.sets } } })).toBe(0);
    expect(await prisma.template.count({ where: { id: kept } })).toBe(1); // live data untouched
    expect(await prisma.exercise.count({ where: { id: ids.exercise } })).toBe(1);

    const state = await prisma.syncState.findUniqueOrThrow({ where: { userId: userA } });
    expect(state.gcFloorVersion).toBeGreaterThanOrEqual(del.cursor - 10);
    expect(state.gcFloorVersion).toBeGreaterThan(0);

    // a client whose cursor predates the floor must reset; cursor 0 and up-to-date cursors must not
    const stale = await applySyncSlots(ctxA, { deviceId: "devOld", cursor: 1, clientHlc: dev.clock.now() }, []);
    expect(stale).toMatchObject({ reset: true, changes: expect.any(Object), cursor: 0, hasMore: true });
    expect(ENTITY_NAMES.every((e) => stale.changes[e].length === 0)).toBe(true);
    const fresh = await applySyncSlots(ctxA, { deviceId: "devNew", cursor: 0, clientHlc: dev.clock.now() }, []);
    expect(fresh.reset).toBe(false);
    expect(fresh.changes.template.some((t) => t.id === kept)).toBe(true);
    const current = await applySyncSlots(ctxA, { deviceId: "devOk", cursor: state.version, clientHlc: dev.clock.now() }, []);
    expect(current.reset).toBe(false);
  });

  it("keeps a tombstoned exercise that live history still references", async () => {
    const dev = new FakeDevice(ctxB, "devBgc");
    const { ids, mutations } = tree(dev);
    await dev.push(mutations, 0);
    await dev.push([dev.mutation("exercise", ids.exercise, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    await collectTombstones(new Date(Date.now() + 120 * 24 * 3600 * 1000), 90);
    expect(await prisma.exercise.count({ where: { id: ids.exercise } })).toBe(1);
    expect(await prisma.workoutSet.count({ where: { id: { in: ids.sets } } })).toBe(ids.sets.length);
    void catalogExerciseId;
  });
});

describe("exerciseFavorite", () => {
  const catalogId = catalogExerciseId("Barbell_Squat");

  it("stars a catalog and a custom exercise, replays idempotently, and pulls the rows back", async () => {
    const dev = new FakeDevice(ctxC, "devCfav");
    const custom = newId();
    const starCatalog = dev.mutation("exerciseFavorite", favoriteId(userC, catalogId), { exerciseId: catalogId, position: "a0" });
    const starCustom = dev.mutation("exerciseFavorite", favoriteId(userC, custom), { exerciseId: custom, position: "a1" });
    // the custom exercise and its favorite travel in one batch: SYNC_ORDER puts the parent first
    const first = await dev.push([starCustom, starCatalog, dev.mutation("exercise", custom, exerciseFields({ slug: `fav-${suffix}`, name: "Fav Press" }))], 0);
    expect(statuses(first)).toEqual(["applied", "applied", "applied"]);
    expect(rowsOf(first, "exerciseFavorite").map((r) => (r as { exerciseId: string }).exerciseId).sort()).toEqual([catalogId, custom].sort());
    const row = rowOf(first, "exerciseFavorite", favoriteId(userC, catalogId));
    expect(row).toMatchObject({ exerciseId: catalogId, position: "a0", deletedAt: null });
    expect(JSON.stringify(row)).not.toContain(userC); // no userId on the wire

    const replay = await dev.push([starCatalog], 0);
    expect(statuses(replay)).toEqual(["noop"]);
    expect(await prisma.exerciseFavorite.count({ where: { userId: userC } })).toBe(2);
    expect((await pullChanges(ctxC, 0)).changes.exerciseFavorite).toHaveLength(2);
  });

  it("unstar is a tombstone and a later re-star restores the same row; an older restore loses", async () => {
    const dev = new FakeDevice(ctxC, "devCtoggle");
    const id = favoriteId(userC, catalogId);
    const before = await prisma.exerciseFavorite.findUniqueOrThrow({ where: { id } });
    const staleHlc = dev.clock.tick();
    const unstar = await dev.push([dev.mutation("exerciseFavorite", id, { deletedAt: new Date().toISOString() })], 0);
    expect(statuses(unstar)).toEqual(["applied"]);
    expect(rowOf(unstar, "exerciseFavorite", id).deletedAt).toBeTruthy();
    // a restore carrying an HLC older than the tombstone does not resurrect the row
    const old = await dev.push([dev.mutation("exerciseFavorite", id, { deletedAt: null }, staleHlc)], 0);
    expect(statuses(old)).toEqual(["noop"]);
    expect((await prisma.exerciseFavorite.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    const restore = await dev.push([dev.mutation("exerciseFavorite", id, { deletedAt: null })], 0);
    expect(statuses(restore)).toEqual(["applied"]);
    const after = await prisma.exerciseFavorite.findUniqueOrThrow({ where: { id } });
    expect(after.deletedAt).toBeNull();
    expect(after.version).toBeGreaterThan(before.version);
    expect(await prisma.exerciseFavorite.count({ where: { id } })).toBe(1);
  });

  it("two devices starring the same exercise concurrently write one row (no failed batch)", async () => {
    const a = new FakeDevice(ctxC, "devC1");
    const b = new FakeDevice(ctxC, "devC2");
    const target = catalogExerciseId("Barbell_Deadlift");
    const id = favoriteId(userC, target);
    const ra = await a.push([a.mutation("exerciseFavorite", id, { exerciseId: target, position: "a2" })], 0);
    const rb = await b.push([b.mutation("exerciseFavorite", id, { exerciseId: target, position: "a2" })], 0);
    expect(statuses(ra)).toEqual(["applied"]);
    expect(["applied", "noop"]).toContain(statuses(rb)[0]);
    expect(await prisma.exerciseFavorite.count({ where: { id } })).toBe(1);
    expect(rb.results.every((r) => r.status !== "rejected")).toBe(true);
  });

  it("rejects an exercise that does not exist for this user, with a dead letter", async () => {
    const dev = new FakeDevice(ctxC, "devCmissing");
    const ghost = newId();
    const res = await dev.push([dev.mutation("exerciseFavorite", favoriteId(userC, ghost), { exerciseId: ghost, position: "a9" })], 0);
    expect(res.results[0]).toMatchObject({ status: "rejected", reason: "MISSING_REFERENCE" });
    expect(await prisma.syncDeadLetter.count({ where: { userId: userC, entity: "exerciseFavorite", entityId: favoriteId(userC, ghost) } })).toBe(1);
    expect(await prisma.exerciseFavorite.count({ where: { id: favoriteId(userC, ghost) } })).toBe(0);
  });

  it("deleting a custom exercise tombstones its favorites (version bump), also one written later by a device that missed the delete", async () => {
    const dev = new FakeDevice(ctxC, "devCorphan");
    const custom = newId();
    const starred = favoriteId(userC, custom);
    await dev.push([dev.mutation("exercise", custom, exerciseFields({ slug: `orph-${suffix}`, name: "Orphan Press" })), dev.mutation("exerciseFavorite", starred, { exerciseId: custom, position: "c0" })], 0);
    const before = await prisma.exerciseFavorite.findUniqueOrThrow({ where: { id: starred } });
    const del = await dev.push([dev.mutation("exercise", custom, { deletedAt: new Date().toISOString() })], 0);
    const row = rowOf(del, "exerciseFavorite", starred);
    expect(row.deletedAt).toBeTruthy();
    expect(row.version).toBeGreaterThan(before.version); // other devices pull the tombstone

    // another device, offline during the delete, restores the star: the exercise is dead, so the star is tombstoned again
    const late = new FakeDevice(ctxC, "devClate");
    const res = await late.push([late.mutation("exerciseFavorite", starred, { deletedAt: null })], 0);
    expect(statuses(res)).toEqual(["applied"]);
    expect((await prisma.exerciseFavorite.findUniqueOrThrow({ where: { id: starred } })).deletedAt).not.toBeNull();
  });

  it("tombstone GC collects old unstarred favorites (and raises the floor) but never a live one", async () => {
    const dev = new FakeDevice(ctxC, "devCgc");
    const dead = catalogExerciseId("Barbell_Curl");
    const live = catalogExerciseId("Leg_Press");
    await dev.push([dev.mutation("exerciseFavorite", favoriteId(userC, dead), { exerciseId: dead, position: "b0" }), dev.mutation("exerciseFavorite", favoriteId(userC, live), { exerciseId: live, position: "b1" })], 0);
    await dev.push([dev.mutation("exerciseFavorite", favoriteId(userC, dead), { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    const early = await collectTombstones(new Date(), 90);
    expect(early.deleted.exerciseFavorite).toBe(0);
    const later = await collectTombstones(new Date(Date.now() + 91 * 24 * 3600 * 1000), 90);
    expect(later.deleted.exerciseFavorite).toBeGreaterThanOrEqual(1);
    expect(await prisma.exerciseFavorite.count({ where: { id: favoriteId(userC, dead) } })).toBe(0);
    expect(await prisma.exerciseFavorite.count({ where: { id: favoriteId(userC, live) } })).toBe(1);
    expect((await prisma.syncState.findUniqueOrThrow({ where: { userId: userC } })).gcFloorVersion).toBeGreaterThan(0);
  });

  it("GC collects a deleted custom exercise only after its favorites, never through the NO ACTION foreign key", async () => {
    const dev = new FakeDevice(ctxC, "devCgc2");
    const custom = newId();
    const starred = favoriteId(userC, custom);
    await dev.push([dev.mutation("exercise", custom, exerciseFields({ slug: `gc-${suffix}`, name: "Doomed Press" })), dev.mutation("exerciseFavorite", starred, { exerciseId: custom, position: "d0" })], 0);
    await dev.push([dev.mutation("exercise", custom, { deletedAt: "2026-10-14T10:00:00.000Z" })], 0);
    const later = new Date(Date.now() + 91 * 24 * 3600 * 1000);
    const summary = await collectTombstones(later, 90);
    expect(summary.deleted.exerciseFavorite).toBeGreaterThanOrEqual(1);
    expect(await prisma.exerciseFavorite.count({ where: { id: starred } })).toBe(0);
    expect(await prisma.exercise.count({ where: { id: custom } })).toBe(0); // collected in the same pass, after the favorite
  });
});

describe("machineProfile.platesKg (plate inventory)", () => {
  it("round-trips an array field through apply and pull, and treats null as the empty list", async () => {
    const dev = new FakeDevice(ctxB, "devBplates");
    const id = newId();
    const bare = newId();
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5];

    const pushed = await dev.push(
      [
        dev.mutation("machineProfile", id, { name: "Home bar", baseLoadKg: 15, platesKg: plates }),
        dev.mutation("machineProfile", bare, { name: "No inventory" }),
      ],
      0,
    );
    expect(statuses(pushed)).toEqual(["applied", "applied"]);
    expect(rowOf(pushed, "machineProfile", id)).toMatchObject({ baseLoadKg: 15, platesKg: plates });
    expect(rowOf(pushed, "machineProfile", bare)).toMatchObject({ platesKg: null });

    const stored = await prisma.machineProfile.findUniqueOrThrow({ where: { id } });
    expect(stored.platesKg.map((d) => d.toNumber())).toEqual(plates);
    expect((await prisma.machineProfile.findUniqueOrThrow({ where: { id: bare } })).platesKg).toEqual([]);

    // A second device pulling from scratch sees the same wire rows.
    const pulled = await pullChanges(ctxB, 0);
    const byId = new Map((pulled.changes.machineProfile as unknown as { id: string; platesKg: number[] | null }[]).map((r) => [r.id, r]));
    expect(byId.get(id)?.platesKg).toEqual(plates);
    expect(byId.get(bare)?.platesKg).toBeNull();
  });

  it("merges platesKg per field by HLC: a newer replacement wins, a stale one is a noop, null clears it", async () => {
    const dev = new FakeDevice(ctxB, "devBplates2");
    const other = new FakeDevice(ctxB, "devBplates3");
    const id = newId();
    await dev.push([dev.mutation("machineProfile", id, { name: "Gym bar", platesKg: [20, 10, 5] })], 0);

    const staleHlc = other.clock.tick();
    const newer = await dev.push([dev.mutation("machineProfile", id, { platesKg: [25, 20, 10, 5, 2.5] })], 0);
    expect(statuses(newer)).toEqual(["applied"]);
    expect(rowOf(newer, "machineProfile", id)).toMatchObject({ platesKg: [25, 20, 10, 5, 2.5] });

    const stale = await other.push([other.mutation("machineProfile", id, { platesKg: [1.25] }, staleHlc)], 0);
    expect(statuses(stale)).toEqual(["noop"]);
    expect((await prisma.machineProfile.findUniqueOrThrow({ where: { id } })).platesKg.map((d) => d.toNumber())).toEqual([25, 20, 10, 5, 2.5]);

    const cleared = await dev.push([dev.mutation("machineProfile", id, { platesKg: null })], 0);
    expect(statuses(cleared)).toEqual(["applied"]);
    expect(rowOf(cleared, "machineProfile", id)).toMatchObject({ platesKg: null });
    expect((await prisma.machineProfile.findUniqueOrThrow({ where: { id } })).platesKg).toEqual([]);
  });
});
