// Needs a migrated, seeded database (your Neon branch in .env.local). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { catalogExerciseId, newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { seedCatalog } from "../../../prisma/seed/catalog";
import { getCatalogVersion, getExerciseDetail, listLibrary, loadCatalog, resetLibraryCache } from "./queries";

const suffix = newId().slice(-12);
const userA = `cat-a-${suffix}`;
const userB = `cat-b-${suffix}`;
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);
const sync = { hlc: "001791990000000-00000-itest", version: 1 };
const customA = newId();
const customB = newId();
const machineProfileId = newId();

async function customExercise(id: string, userId: string, name: string) {
  await prisma.exercise.create({
    data: {
      id, userId, slug: name.toLowerCase().replace(/\W+/g, "-"), name, modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK",
      category: "STRENGTH", ...sync, muscles: { create: [{ muscle: "CHEST", role: "PRIMARY" }] },
    },
  });
}

beforeAll(async () => {
  await seedCatalog(prisma);
  for (const id of [userA, userB]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  await customExercise(customA, userA, `Zephyr Press ${suffix}`);
  await customExercise(customB, userB, `Zephyr Fly ${suffix}`);

  await prisma.machineProfile.create({ data: { id: machineProfileId, userId: userA, name: "Hammer", gymName: "Downtown", exerciseId: customA, ...sync } });
  const workoutId = newId();
  const workoutExerciseId = newId();
  await prisma.workout.create({
    data: { id: workoutId, userId: userA, startedAt: new Date("2026-10-12T17:00:00Z"), localDate: new Date("2026-10-12"), timezone: "UTC", isDeload: false, ...sync },
  });
  await prisma.workoutExercise.create({ data: { id: workoutExerciseId, userId: userA, workoutId, exerciseId: customA, machineProfileId, position: "a0", ...sync } });
  const set = (position: string, completedAt: Date | null, extra: object = {}) => ({
    id: newId(), userId: userA, workoutExerciseId, workoutId, exerciseId: customA, machineProfileId, seriesKey: `${customA}:${machineProfileId}`,
    localDate: new Date("2026-10-12"), position, weightKg: 40, reps: 10, completedAt, ...sync, ...extra,
  });
  await prisma.workoutSet.createMany({
    data: [set("a0", new Date("2026-10-12T17:10:00Z")), set("a1", new Date("2026-10-12T17:15:00Z")), set("a2", null), set("a3", new Date("2026-10-12T17:20:00Z"), { deletedAt: new Date() })],
  });
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("listLibrary", () => {
  it("includes the caller's custom exercises and never another user's", async () => {
    const a = await listLibrary(ctxA, { text: "zephyr" });
    expect(a.exercises.map((e) => e.id)).toEqual([customA]);
    expect(a.exercises[0]).toMatchObject({ isCustom: true, sourceId: null });
    const b = await listLibrary(ctxB, { text: "zephyr" });
    expect(b.exercises.map((e) => e.id)).toEqual([customB]);
  });

  it("filters by modality, equipment, muscle and text, with facet counts", async () => {
    const machines = await listLibrary(ctxA, { modality: "MACHINE", pageSize: 200 });
    expect(machines.exercises.length).toBeGreaterThan(60);
    expect(machines.exercises.every((e) => e.modality === "MACHINE")).toBe(true);
    expect(machines.total).toBe(machines.modalityCounts.MACHINE);
    expect(machines.equipmentOptions.map((o) => o.equipment)).toContain("SMITH_MACHINE");
    expect(machines.equipmentOptions.every((o) => ["MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "SMITH_MACHINE", "OTHER"].includes(o.equipment))).toBe(true);

    const smith = await listLibrary(ctxA, { modality: "MACHINE", equipment: "SMITH_MACHINE", pageSize: 200 });
    expect(smith.exercises.length).toBeGreaterThanOrEqual(21);
    expect(smith.exercises.every((e) => e.equipment === "SMITH_MACHINE")).toBe(true);

    const biceps = await listLibrary(ctxA, { muscle: "BICEPS", text: "curl", pageSize: 200 });
    expect(biceps.exercises.length).toBeGreaterThan(10);
    for (const e of biceps.exercises) {
      expect(e.muscles.some((m) => m.muscle === "BICEPS")).toBe(true);
      expect(e.name.toLowerCase()).toContain("curl");
    }
  });

  it("keeps free weights out of the machine tab and the reverse, for the whole catalog", async () => {
    const free = await listLibrary(ctxA, { modality: "FREE_WEIGHT", pageSize: 500 });
    expect(free.exercises.every((e) => !["MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "SMITH_MACHINE", "CABLE"].includes(e.equipment))).toBe(true);
    const all = await listLibrary(ctxA, {});
    const counted = Object.values(all.modalityCounts).reduce((a, b) => a + b, 0);
    expect(counted).toBe(all.total);
  });

  it("pages deterministically and clamps out-of-range pages", async () => {
    const one = await listLibrary(ctxA, { pageSize: 10, page: 1 });
    const two = await listLibrary(ctxA, { pageSize: 10, page: 2 });
    expect(one.exercises).toHaveLength(10);
    expect(two.exercises.map((e) => e.id)).not.toEqual(one.exercises.map((e) => e.id));
    const far = await listLibrary(ctxA, { pageSize: 10, page: 9999 });
    expect(far.page).toBe(far.pageCount);
    expect(far.exercises.length).toBeGreaterThan(0);
  });
});

describe("getExerciseDetail", () => {
  it("returns catalog exercises with muscles and no series for a user who never logged them", async () => {
    const detail = await getExerciseDetail(ctxA, catalogExerciseId("Leg_Press"));
    expect(detail?.exercise).toMatchObject({ name: "Leg Press", modality: "MACHINE", loadType: "PLATES_PER_SIDE", isCustom: false });
    expect(detail?.exercise.muscles.length).toBeGreaterThan(0);
    expect(detail?.series).toEqual([]);
  });

  it("never reveals another user's custom exercise", async () => {
    expect(await getExerciseDetail(ctxA, customB)).toBeNull();
    expect(await getExerciseDetail(ctxB, customA)).toBeNull();
    expect(await getExerciseDetail(ctxA, newId())).toBeNull();
  });

  it("lists the machine-profile series with completed, non-deleted sets only", async () => {
    const detail = await getExerciseDetail(ctxA, customA);
    expect(detail?.series).toEqual([
      {
        seriesKey: `${customA}:${machineProfileId}`,
        machineProfile: { id: machineProfileId, name: "Hammer", gymName: "Downtown", brand: null },
        setCount: 2,
        lastLocalDate: "2026-10-12",
      },
    ]);
  });
});

describe("loadCatalog", () => {
  it("returns every global exercise at the current version, without custom exercises", async () => {
    const version = await getCatalogVersion();
    expect(version).toBeGreaterThanOrEqual(1);
    const catalog = await loadCatalog(version);
    expect(catalog.version).toBe(version);
    expect(catalog.exercises).toHaveLength(876);
    expect(catalog.exercises.every((e) => !e.isCustom && e.version === 0 && e.hlc === "")).toBe(true);
    expect(catalog.exercises.some((e) => e.id === customA)).toBe(false);
  });

  it("reads the database once per catalog version (a new device costs no catalog read)", async () => {
    resetLibraryCache();
    const version = await getCatalogVersion();
    const reads = vi.spyOn(prisma.exercise, "findMany");
    const [first, second] = await Promise.all([loadCatalog(version), loadCatalog(version)]);
    const third = await loadCatalog(version);
    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(reads).toHaveBeenCalledTimes(1);
    // A reseed bumps the version: the next request reads again.
    const bumped = await loadCatalog(version + 1);
    expect(bumped.version).toBe(version + 1);
    expect(reads).toHaveBeenCalledTimes(2);
    resetLibraryCache();
    await loadCatalog(version);
    expect(reads).toHaveBeenCalledTimes(3);
    reads.mockRestore();
    resetLibraryCache();
  });
});
