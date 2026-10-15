import "server-only";
// Server-side derivation of WorkoutSet columns: loads the set's parents (workoutExercise, workout, exercise, machine
// profile, bodyweight) and runs the shared pure `deriveSetColumns`. Parents are cached for the duration of one sync
// transaction; `invalidate` drops an entry when the batch rewrites that row.
import type { WorkoutSetDerived } from "@/contracts/entities";
import type { LoadType } from "@/contracts/enums";
import { dateToLocalDate } from "@/lib/dates";
import { deriveSetColumns } from "@/lib/sync/derive";
import type { UserCtx } from "@/server/auth/ctx";
import { num } from "@/server/mappers";
import type { Tx } from "./entities";

interface WeInfo {
  workoutId: string;
  exerciseId: string;
  machineProfileId: string | null;
}
interface WorkoutInfo {
  localDate: string;
  bodyweightKg: number | null;
}
interface ExerciseInfo {
  loadType: LoadType;
  isUnilateral: boolean;
  bodyweightFactor: number | null;
}
interface MetricPoint {
  localDate: string;
  weightKg: number;
}

export interface SetDeriveInput {
  workoutExerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
}

export class SetDeriver {
  private we = new Map<string, WeInfo | null>();
  private workouts = new Map<string, WorkoutInfo | null>();
  private exercises = new Map<string, ExerciseInfo | null>();
  private machines = new Map<string, { baseLoadKg: number | null } | null>();
  private metrics: MetricPoint[] | null = null;

  constructor(
    private readonly tx: Tx,
    private readonly ctx: UserCtx,
  ) {}

  invalidate(entity: string, id?: string): void {
    const maps: Record<string, Map<string, unknown>> = {
      workoutExercise: this.we,
      workout: this.workouts,
      exercise: this.exercises,
      machineProfile: this.machines,
    };
    if (entity === "bodyMetric") this.metrics = null;
    else if (id) maps[entity]?.delete(id);
  }

  private async cached<T>(map: Map<string, T | null>, id: string, load: () => Promise<T | null>): Promise<T | null> {
    if (map.has(id)) return map.get(id) ?? null;
    const value = await load();
    map.set(id, value);
    return value;
  }

  private async loadMetrics(): Promise<MetricPoint[]> {
    if (this.metrics) return this.metrics;
    const rows = await this.tx.bodyMetric.findMany({
      where: { userId: this.ctx.id, deletedAt: null, weightKg: { not: null } },
      orderBy: [{ localDate: "asc" }, { measuredAt: "asc" }],
      select: { localDate: true, weightKg: true },
    });
    this.metrics = rows.map((r) => ({ localDate: dateToLocalDate(r.localDate), weightKg: num(r.weightKg) as number }));
    return this.metrics;
  }

  /** The latest body metric on or before `localDate`, else the earliest one after it. */
  private async fallbackBodyweight(localDate: string): Promise<number | null> {
    const metrics = await this.loadMetrics();
    let pick: MetricPoint | undefined;
    for (const m of metrics) if (m.localDate <= localDate) pick = m;
    return (pick ?? metrics[0])?.weightKg ?? null;
  }

  /** null when a parent row is missing (the caller treats that as a missing reference). */
  async derive(set: SetDeriveInput): Promise<WorkoutSetDerived | null> {
    const userId = this.ctx.id;
    const we = await this.cached(this.we, set.workoutExerciseId, async () =>
      this.tx.workoutExercise.findFirst({
        where: { id: set.workoutExerciseId, userId },
        select: { workoutId: true, exerciseId: true, machineProfileId: true },
      }),
    );
    if (!we) return null;
    const workout = await this.cached(this.workouts, we.workoutId, async () => {
      const row = await this.tx.workout.findFirst({ where: { id: we.workoutId, userId }, select: { localDate: true, bodyweightKg: true } });
      return row ? { localDate: dateToLocalDate(row.localDate), bodyweightKg: num(row.bodyweightKg) } : null;
    });
    const exercise = await this.cached(this.exercises, we.exerciseId, async () => {
      const row = await this.tx.exercise.findFirst({
        where: { id: we.exerciseId, OR: [{ userId }, { userId: null }] },
        select: { loadType: true, isUnilateral: true, bodyweightFactor: true },
      });
      return row ? { loadType: row.loadType, isUnilateral: row.isUnilateral, bodyweightFactor: num(row.bodyweightFactor) } : null;
    });
    if (!workout || !exercise) return null;
    const machineProfile = we.machineProfileId
      ? await this.cached(this.machines, we.machineProfileId, async () => {
          const row = await this.tx.machineProfile.findFirst({ where: { id: we.machineProfileId as string, userId }, select: { baseLoadKg: true } });
          return row ? { baseLoadKg: num(row.baseLoadKg) } : null;
        })
      : null;
    const needsFallback = exercise.loadType === "BODYWEIGHT_PLUS" && workout.bodyweightKg == null;
    return deriveSetColumns({
      set,
      workoutExercise: we,
      workout,
      exercise,
      machineProfile,
      fallbackBodyweightKg: needsFallback ? await this.fallbackBodyweight(workout.localDate) : null,
    });
  }
}
