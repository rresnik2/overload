// Needs a migrated database (DATABASE_URL in .env.local or CI). Run: pnpm test:integration
// Two users: every progress / body / PR query returns only the caller's data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newId } from "@/lib/ids";
import { mintUserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadBodyView } from "./body";
import { loadPrBoard } from "./prs";
import { loadExerciseProgress, loadProgressOverview } from "./progress";

const suffix = newId().slice(-12);
const userA = `pq-a-${suffix}`;
const userB = `pq-b-${suffix}`;
const sync = { hlc: "001791990000000-00000-itest", version: 1 };
const TODAY = "2026-10-14";

async function seedUser(id: string, weightKg: number) {
  await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
  const exerciseId = newId();
  await prisma.exercise.create({
    data: {
      id: exerciseId, userId: id, slug: `ex-${id}`, name: `Custom ${id}`, modality: "FREE_WEIGHT", equipment: "BARBELL",
      loadType: "TOTAL", category: "STRENGTH", ...sync, muscles: { create: [{ muscle: "CHEST", role: "PRIMARY" }] },
    },
  });
  const workoutId = newId();
  await prisma.workout.create({ data: { id: workoutId, userId: id, startedAt: new Date("2026-10-12T17:00:00Z"), localDate: new Date("2026-10-12"), timezone: "UTC", isDeload: false, ...sync } });
  const workoutExerciseId = newId();
  await prisma.workoutExercise.create({ data: { id: workoutExerciseId, userId: id, workoutId, exerciseId, position: "a0", ...sync } });
  const setId = newId();
  await prisma.workoutSet.create({
    data: { id: setId, userId: id, workoutExerciseId, workoutId, exerciseId, seriesKey: exerciseId, localDate: new Date("2026-10-12"), position: "a0", weightKg, reps: 5, effectiveLoadKg: weightKg, e1rmKg: weightKg * 1.2, completedAt: new Date("2026-10-12T17:10:00Z"), ...sync },
  });
  await prisma.personalRecord.create({ data: { userId: id, exerciseId, seriesKey: exerciseId, type: "E1RM", reps: 0, value: weightKg * 1.2, setId, workoutId, achievedAt: new Date("2026-10-12T17:10:00Z") } });
  await prisma.bodyMetric.create({ data: { id: newId(), userId: id, measuredAt: new Date("2026-10-12T07:00:00Z"), localDate: new Date("2026-10-12"), weightKg: weightKg - 20, ...sync } });
  return exerciseId;
}

let exerciseA = "";
let exerciseB = "";
beforeAll(async () => {
  exerciseA = await seedUser(userA, 100);
  exerciseB = await seedUser(userB, 60);
});
afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
});

describe("progress queries (real Postgres, two users)", () => {
  it("the overview lists only the caller's series", async () => {
    const a = await loadProgressOverview(mintUserCtx(userA), { today: TODAY });
    expect(a.cards.map((c) => c.exerciseName)).toEqual([`Custom ${userA}`]);
    expect(a.cards[0]!.latestE1rmKg).toBe(120);
    const b = await loadProgressOverview(mintUserCtx(userB), { today: TODAY });
    expect(b.cards.map((c) => c.exerciseName)).toEqual([`Custom ${userB}`]);
    expect(b.cards[0]!.latestE1rmKg).toBe(72);
    expect(JSON.stringify(a)).not.toContain("userId");
  });

  it("an exercise page is empty for someone else's custom exercise", async () => {
    expect(await loadExerciseProgress(mintUserCtx(userB), exerciseA, { today: TODAY })).toBeNull();
    const own = await loadExerciseProgress(mintUserCtx(userA), exerciseA, { today: TODAY });
    expect(own?.selected?.e1rm).toHaveLength(1);
    expect(own?.selected?.forecast.status).toBe("insufficient");
    expect(await loadExerciseProgress(mintUserCtx(userA), "not-a-uuid", { today: TODAY })).toBeNull();
  });

  it("body view and PR board are scoped to the caller", async () => {
    const bodyA = await loadBodyView(mintUserCtx(userA), { today: TODAY });
    const bodyB = await loadBodyView(mintUserCtx(userB), { today: TODAY });
    expect(bodyA.weight.latestKg).toBe(80);
    expect(bodyB.weight.latestKg).toBe(40);
    const prsA = await loadPrBoard(mintUserCtx(userA));
    expect(prsA.series.map((s) => s.exerciseId)).toEqual([exerciseA]);
    expect((await loadPrBoard(mintUserCtx(userB))).series.map((s) => s.exerciseId)).toEqual([exerciseB]);
    expect((await loadPrBoard(mintUserCtx("nobody"))).series).toEqual([]);
  });
});
