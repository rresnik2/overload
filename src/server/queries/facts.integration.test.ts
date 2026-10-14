// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadAnalyticsInput, loadBodyFacts, loadSetFacts } from "./facts";

const suffix = newId().slice(-12);
const userA = `it-a-${suffix}`;
const userB = `it-b-${suffix}`;
const sync = { hlc: "001791990000000-00000-itest", version: 1 };

async function seedUser(id: string, weightKg: number) {
  await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  const exerciseId = newId();
  const workoutId = newId();
  const workoutExerciseId = newId();
  await prisma.exercise.create({
    data: {
      id: exerciseId, userId: id, slug: `ex-${id}`, name: `Custom ${id}`, modality: "FREE_WEIGHT", equipment: "BARBELL",
      loadType: "TOTAL", category: "STRENGTH", ...sync, muscles: { create: [{ muscle: "CHEST", role: "PRIMARY" }] },
    },
  });
  await prisma.workout.create({
    data: { id: workoutId, userId: id, startedAt: new Date("2026-10-12T17:00:00Z"), localDate: new Date("2026-10-12"), timezone: "UTC", isDeload: false, ...sync },
  });
  await prisma.workoutExercise.create({ data: { id: workoutExerciseId, userId: id, workoutId, exerciseId, position: "a0", ...sync } });
  await prisma.workoutSet.createMany({
    data: [
      { id: newId(), userId: id, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date("2026-10-12"), position: "a0", weightKg, reps: 5, effectiveLoadKg: weightKg, e1rmKg: weightKg * 1.2, completedAt: new Date("2026-10-12T17:10:00Z"), ...sync },
      // planned (not completed): must never appear in facts
      { id: newId(), userId: id, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date("2026-10-12"), position: "a1", weightKg, reps: 5, completedAt: null, ...sync },
      // tombstoned: must never appear
      { id: newId(), userId: id, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date("2026-10-12"), position: "a2", weightKg, reps: 5, completedAt: new Date("2026-10-12T17:20:00Z"), deletedAt: new Date(), ...sync },
    ],
  });
  await prisma.bodyMetric.create({ data: { id: newId(), userId: id, measuredAt: new Date("2026-10-12T07:00:00Z"), localDate: new Date("2026-10-12"), weightKg: 80, ...sync } });
  return exerciseId;
}

let exerciseA = "";
beforeAll(async () => {
  exerciseA = await seedUser(userA, 100);
  await seedUser(userB, 60);
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

const range = { from: "2026-10-01", to: "2026-10-31" };

describe("facts queries (real Postgres)", () => {
  it("returns only the caller's completed, non-deleted sets", async () => {
    const a = await loadSetFacts(mintUserCtx(userA), range);
    expect(a.sets).toHaveLength(1);
    expect(a.sets[0]).toMatchObject({ weightKg: 100, reps: 5, e1rmKg: 120, localDate: "2026-10-12", exerciseId: exerciseA });
    expect(a.exercises.map((e) => e.name)).toEqual([`Custom ${userA}`]);
    expect(a.exercises[0]?.muscles).toEqual([{ muscle: "CHEST", role: "PRIMARY" }]);
    const b = await loadSetFacts(mintUserCtx(userB), range);
    expect(b.sets).toHaveLength(1);
    expect(b.sets[0]?.weightKg).toBe(60);
    expect(b.exercises.map((e) => e.name)).toEqual([`Custom ${userB}`]);
  });

  it("filters by date range and isolates body metrics", async () => {
    expect((await loadSetFacts(mintUserCtx(userA), { from: "2026-11-01", to: "2026-11-30" })).sets).toHaveLength(0);
    expect(await loadBodyFacts(mintUserCtx(userA), range)).toHaveLength(1);
    expect(await loadBodyFacts(mintUserCtx("nobody"), range)).toHaveLength(0);
  });

  it("assembles AnalyticsInput with profile defaults", async () => {
    const input = await loadAnalyticsInput(mintUserCtx(userA), { today: "2026-10-14" });
    expect(input.profile).toMatchObject({ sex: null, unitPreference: "KG", timezone: "UTC", e1rmFormula: "EPLEY" });
    expect(input.sets).toHaveLength(1);
    expect(input.bodyMetrics[0]?.weightKg).toBe(80);
  });

  it("deleting a user cascades through the whole domain graph", async () => {
    const id = `it-del-${suffix}`;
    await seedUser(id, 50);
    await prisma.user.delete({ where: { id } });
    expect(await prisma.workoutSet.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.workout.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.exercise.count({ where: { userId: id } })).toBe(0);
    expect(await prisma.exerciseMuscle.count({ where: { exercise: { userId: id } } })).toBe(0);
  });
});
