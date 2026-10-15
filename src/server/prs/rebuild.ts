import "server-only";
// Rebuild PersonalRecord rows for the series touched by a sync request (inside the sync transaction).
// computeSeriesPrs is the single source of truth: the rows are a pure function of the user's live completed sets.
import type { PersonalRecordRow } from "@/contracts/entities";
import type { PrSetInput } from "@/contracts/prs";
import { computeSeriesPrs } from "@/lib/sync/prs";
import type { UserCtx } from "@/server/auth/ctx";
import { num, numRequired, personalRecordToRow } from "@/server/mappers";
import type { Tx } from "@/server/sync/entities";

const key = (c: { type: string; reps: number }) => `${c.type}:${c.reps}`;

/**
 * Recompute the PRs of each series key. Returns the rows that are NEW or IMPROVED by this rebuild ("new PR" toast),
 * except for a series that had no PRs at all before (its first logged sets are not a record worth announcing).
 */
export async function rebuildSeriesPrs(tx: Tx, ctx: UserCtx, seriesKeys: Iterable<string>): Promise<PersonalRecordRow[]> {
  const announced: PersonalRecordRow[] = [];

  for (const seriesKey of new Set(seriesKeys)) {
    const sets = await tx.workoutSet.findMany({
      where: { userId: ctx.id, seriesKey, deletedAt: null, completedAt: { not: null } },
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
    const inputs: PrSetInput[] = sets.map((s) => ({
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
    }));
    const candidates = computeSeriesPrs(inputs);
    const existing = await tx.personalRecord.findMany({ where: { userId: ctx.id, seriesKey } });
    const byKey = new Map(existing.map((e) => [key(e), e]));
    const wanted = new Set(candidates.map(key));

    const stale = existing.filter((e) => !wanted.has(key(e)));
    if (stale.length > 0) await tx.personalRecord.deleteMany({ where: { id: { in: stale.map((e) => e.id) } } });

    for (const c of candidates) {
      const current = byKey.get(key(c));
      const achievedAt = new Date(c.achievedAt);
      const data = {
        exerciseId: c.exerciseId,
        machineProfileId: c.machineProfileId,
        value: c.value,
        setId: c.setId,
        workoutId: c.workoutId,
        achievedAt,
      };
      if (!current) {
        const created = await tx.personalRecord.create({
          data: { userId: ctx.id, seriesKey, type: c.type, reps: c.reps, previousValue: null, ...data },
        });
        if (existing.length > 0) announced.push(personalRecordToRow(created));
        continue;
      }
      const same =
        numRequired(current.value) === c.value &&
        current.setId === c.setId &&
        current.workoutId === c.workoutId &&
        current.achievedAt.getTime() === achievedAt.getTime() &&
        current.exerciseId === c.exerciseId &&
        current.machineProfileId === c.machineProfileId;
      if (same) continue;
      const improved = c.value > numRequired(current.value);
      const updated = await tx.personalRecord.update({
        where: { id: current.id },
        data: { ...data, previousValue: improved ? numRequired(current.value) : num(current.previousValue), computedAt: new Date() },
      });
      if (improved) announced.push(personalRecordToRow(updated));
    }
  }
  return announced;
}
