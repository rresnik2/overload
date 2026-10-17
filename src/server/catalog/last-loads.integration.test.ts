// Needs a migrated, seeded database (your Neon branch in .env.local). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catalogExerciseId, newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { seedCatalog } from "../../../prisma/seed/catalog";
import { listLastLoads, listRecentExercises } from "./last-loads";

const suffix = newId().slice(-12);
const userA = `ll-a-${suffix}`;
const userB = `ll-b-${suffix}`;
const ctxA = mintUserCtx(userA);
const ctxB = mintUserCtx(userB);
const sync = { hlc: "001791990000000-00000-itest", version: 1 };
const squat = catalogExerciseId("Barbell_Squat");
const curl = catalogExerciseId("Barbell_Curl");

async function session(userId: string, exerciseId: string, localDate: string, sets: { weightKg: number; reps: number; setType?: "WARMUP" | "WORKING"; done?: boolean; deleted?: boolean }[]) {
  const workoutId = newId();
  const workoutExerciseId = newId();
  await prisma.workout.create({ data: { id: workoutId, userId, startedAt: new Date(`${localDate}T17:00:00Z`), localDate: new Date(localDate), timezone: "UTC", isDeload: false, ...sync } });
  await prisma.workoutExercise.create({ data: { id: workoutExerciseId, userId, workoutId, exerciseId, position: "a0", ...sync } });
  await prisma.workoutSet.createMany({
    data: sets.map((s, i) => ({
      id: newId(), userId, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date(localDate), position: `a${i}`,
      setType: s.setType ?? "WORKING", weightKg: s.weightKg, effectiveLoadKg: s.weightKg, reps: s.reps,
      completedAt: s.done === false ? null : new Date(`${localDate}T17:${10 + i}:00Z`), deletedAt: s.deleted ? new Date() : null, ...sync,
    })),
  });
}

beforeAll(async () => {
  await seedCatalog(prisma);
  for (const id of [userA, userB]) await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  // an older, heavier squat day, then the latest day: a warm-up, two working sets, a planned set and a deleted one
  await session(userA, squat, "2026-10-05", [{ weightKg: 140, reps: 3 }]);
  await session(userA, squat, "2026-10-12", [
    { weightKg: 60, reps: 8, setType: "WARMUP" },
    { weightKg: 110, reps: 5 },
    { weightKg: 110, reps: 6 },
    { weightKg: 150, reps: 5, done: false },
    { weightKg: 160, reps: 5, deleted: true },
  ]);
  await session(userA, curl, "2026-10-14", [{ weightKg: 35, reps: 10 }]);
  await session(userB, squat, "2026-10-15", [{ weightKg: 200, reps: 1 }]);
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("listLastLoads", () => {
  it("takes the heaviest counted set of the latest day, most reps on a tie", async () => {
    const loads = await listLastLoads(ctxA, { exerciseIds: [squat] });
    expect(loads.get(squat)).toEqual({ exerciseId: squat, localDate: "2026-10-12", weightKg: 110, reps: 6, pinStepKg: null, inputUnit: null });
  });

  it("lists the most recently trained first, up to the limit", async () => {
    const loads = await listLastLoads(ctxA, { limit: 1 });
    expect([...loads.keys()]).toEqual([curl]);
    expect([...(await listLastLoads(ctxA, { limit: 5 })).keys()]).toEqual([curl, squat]);
  });

  it("never reads another user's sets", async () => {
    expect((await listLastLoads(ctxB, { exerciseIds: [squat, curl] })).get(squat)?.weightKg).toBe(200);
    expect((await listLastLoads(ctxB, { exerciseIds: [curl] })).size).toBe(0);
  });

  it("lists the recent exercises as rows, newest first", async () => {
    const { exercises, loads } = await listRecentExercises(ctxA, 5);
    expect(exercises.map((e) => e.id)).toEqual([curl, squat]);
    expect(loads.get(curl)?.weightKg).toBe(35);
  });

  it("returns nothing for an empty id list", async () => {
    expect((await listLastLoads(ctxA, { exerciseIds: [] })).size).toBe(0);
  });
});
