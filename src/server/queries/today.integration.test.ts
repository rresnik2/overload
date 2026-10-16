// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
// Two users, each with a custom bench-press exercise and one set: loadTodayLifts returns only the caller's estimate.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadTodayLifts } from "./today";

const suffix = newId().slice(-12);
const userA = `tq-a-${suffix}`;
const userB = `tq-b-${suffix}`;
const sync = { hlc: "001791990000000-00000-itest", version: 1 };
const TODAY = "2026-10-14";

async function seedUser(id: string, weightKg: number) {
  await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  const exerciseId = newId();
  await prisma.exercise.create({
    data: {
      id: exerciseId, userId: id, slug: `ex-${id}`, name: `Bench ${id}`, modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL",
      standardLift: "BENCH_PRESS", category: "STRENGTH", ...sync, muscles: { create: [{ muscle: "CHEST", role: "PRIMARY" }] },
    },
  });
  const workoutId = newId();
  await prisma.workout.create({ data: { id: workoutId, userId: id, startedAt: new Date("2026-10-12T17:00:00Z"), localDate: new Date("2026-10-12"), timezone: "UTC", isDeload: false, ...sync } });
  const workoutExerciseId = newId();
  await prisma.workoutExercise.create({ data: { id: workoutExerciseId, userId: id, workoutId, exerciseId, position: "a0", ...sync } });
  await prisma.workoutSet.create({
    data: {
      id: newId(), userId: id, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date("2026-10-12"), position: "a0",
      weightKg, reps: 5, effectiveLoadKg: weightKg, e1rmKg: weightKg * 1.2, completedAt: new Date("2026-10-12T17:10:00Z"), ...sync,
    },
  });
}

beforeAll(async () => {
  await seedUser(userA, 100);
  await seedUser(userB, 60);
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("loadTodayLifts (real Postgres, two users)", () => {
  it("returns four tiles and fills only the lifts the caller has trained", async () => {
    const a = await loadTodayLifts(mintUserCtx(userA), { today: TODAY });
    expect(a.tiles.map((t) => t.lift)).toEqual(["SQUAT", "BENCH_PRESS", "DEADLIFT", "OVERHEAD_PRESS"]);
    const bench = a.tiles.find((t) => t.lift === "BENCH_PRESS")!;
    expect(bench).toMatchObject({ changeKg: null, lastLocalDate: "2026-10-12" });
    expect(bench.e1rmKg).toBeCloseTo(116.7, 1); // 100 kg x 5: computed from the set, not the stored column
    expect(a.tiles.filter((t) => t.e1rmKg == null).map((t) => t.lift)).toEqual(["SQUAT", "DEADLIFT", "OVERHEAD_PRESS"]);
    expect(a.chart).toMatchObject({ lift: "BENCH_PRESS" });
    expect(a.chart?.points).toHaveLength(1);
    expect(a.unit).toBe("KG");
  });

  it("never mixes in another user's custom exercise or sets", async () => {
    const b = await loadTodayLifts(mintUserCtx(userB), { today: TODAY });
    expect(b.tiles.find((t) => t.lift === "BENCH_PRESS")?.e1rmKg).toBeCloseTo(70, 1);
    expect(JSON.stringify(b)).not.toContain("userId");
    expect(JSON.stringify(b)).not.toContain(userA);
  });

  it("is all empty for a user with no sets", async () => {
    const id = `tq-c-${suffix}`;
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    try {
      const c = await loadTodayLifts(mintUserCtx(id), { today: TODAY });
      expect(c.tiles.every((t) => t.e1rmKg == null)).toBe(true);
      expect(c.chart).toBeNull();
    } finally {
      await prisma.user.delete({ where: { id } });
    }
  });
});
