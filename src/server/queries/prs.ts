import "server-only";
// PR board loader (stream F). PersonalRecord rows are the source of truth (rebuilt by the sync transaction); for an account
// whose rows were never rebuilt (seeded data) the board is derived from the completed sets with the same pure function.
import type { PersonalRecordRow } from "@/contracts/entities";
import type { PrSetInput } from "@/contracts/prs";
import type { ProfileFact } from "@/contracts/analytics";
import { computeSeriesPrs } from "@/lib/sync/prs";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { localDate as dateOnly, num, personalRecordToRow } from "@/server/mappers";
import { exerciseRowToMeta, loadProfileFact, machineProfileRowToMeta } from "@/server/queries/facts";
import { buildPrBoard, type PrBoard } from "./prs.shape";
import { loadToday } from "./progress";

export interface PrBoardData extends PrBoard {
  unit: ProfileFact["unitPreference"];
}

/** Derive PR rows from sets (used only when the user has none stored). Ids are synthetic and never leave this module's output. */
async function derivePrRows(ctx: UserCtx): Promise<PersonalRecordRow[]> {
  const sets = await prisma.workoutSet.findMany({
    where: {
      userId: ctx.id,
      deletedAt: null,
      completedAt: { not: null },
      workout: { userId: ctx.id, deletedAt: null },
      workoutExercise: { userId: ctx.id, deletedAt: null },
    },
    select: {
      id: true,
      workoutId: true,
      exerciseId: true,
      machineProfileId: true,
      seriesKey: true,
      setType: true,
      completedAt: true,
      reps: true,
      effectiveLoadKg: true,
      e1rmKg: true,
    },
  });
  const bySeries = new Map<string, PrSetInput[]>();
  for (const s of sets) {
    const input: PrSetInput = {
      id: s.id,
      workoutId: s.workoutId,
      exerciseId: s.exerciseId,
      machineProfileId: s.machineProfileId,
      seriesKey: s.seriesKey,
      setType: s.setType,
      completedAt: s.completedAt ? s.completedAt.toISOString() : null,
      reps: s.reps,
      effectiveLoadKg: num(s.effectiveLoadKg),
      e1rmKg: num(s.e1rmKg),
    };
    bySeries.set(s.seriesKey, [...(bySeries.get(s.seriesKey) ?? []), input]);
  }
  return [...bySeries.values()].flatMap((inputs) =>
    computeSeriesPrs(inputs).map((c) => ({
      id: `${c.seriesKey}:${c.type}:${c.reps}`,
      exerciseId: c.exerciseId,
      machineProfileId: c.machineProfileId,
      seriesKey: c.seriesKey,
      type: c.type,
      reps: c.reps,
      value: c.value,
      previousValue: null,
      setId: c.setId,
      workoutId: c.workoutId,
      achievedAt: c.achievedAt,
    })),
  );
}

export async function loadPrBoard(ctx: UserCtx, opts: { recentLimit?: number } = {}): Promise<PrBoardData> {
  const stored = await prisma.personalRecord.findMany({ where: { userId: ctx.id }, orderBy: { achievedAt: "desc" } });
  const rows = stored.length > 0 ? stored.map(personalRecordToRow) : await derivePrRows(ctx);

  const exerciseIds = [...new Set(rows.map((r) => r.exerciseId))];
  const machineIds = [...new Set(rows.flatMap((r) => (r.machineProfileId ? [r.machineProfileId] : [])))];
  const workoutIds = [...new Set(rows.map((r) => r.workoutId))];
  const [exercises, machines, workouts, profile] = await Promise.all([
    exerciseIds.length
      ? prisma.exercise.findMany({ where: { id: { in: exerciseIds }, OR: [{ userId: null }, { userId: ctx.id }] }, include: { muscles: true } })
      : [],
    machineIds.length ? prisma.machineProfile.findMany({ where: { userId: ctx.id, id: { in: machineIds } } }) : [],
    workoutIds.length ? prisma.workout.findMany({ where: { userId: ctx.id, id: { in: workoutIds } }, select: { id: true, localDate: true } }) : [],
    loadProfileFact(ctx, await loadToday(ctx)),
  ]);

  const board = buildPrBoard({
    rows,
    exercises: exercises.map(exerciseRowToMeta),
    machineProfiles: machines.map(machineProfileRowToMeta),
    workoutDates: new Map(workouts.map((w) => [w.id, dateOnly(w.localDate)])),
    recentLimit: opts.recentLimit,
  });
  return { ...board, unit: profile.unitPreference };
}
