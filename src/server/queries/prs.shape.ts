// Pure shaping for the PR board (no Prisma): PersonalRecordRow[] -> one block per series, plus the latest records overall.
import type { ExerciseMeta, MachineProfileMeta } from "@/contracts/analytics";
import type { PersonalRecordRow } from "@/contracts/entities";
import type { Modality, PrType } from "@/contracts/enums";
import type { LocalDate } from "@/lib/dates";
import { seriesLabel } from "./progress.shape";

export const PR_TYPE_ORDER: readonly PrType[] = ["E1RM", "MAX_LOAD", "REP_MAX", "MAX_SET_VOLUME", "MAX_SESSION_VOLUME", "MAX_REPS"];

export const PR_TYPE_LABEL: Record<PrType, string> = {
  E1RM: "Estimated 1RM",
  MAX_LOAD: "Heaviest set",
  REP_MAX: "Rep max",
  MAX_REPS: "Most reps",
  MAX_SET_VOLUME: "Best set volume",
  MAX_SESSION_VOLUME: "Best session volume",
};

/** What the value is: kg (convert at the UI edge) or a rep count. */
export const PR_VALUE_KIND: Record<PrType, "weight" | "reps"> = {
  E1RM: "weight",
  MAX_LOAD: "weight",
  REP_MAX: "weight",
  MAX_REPS: "reps",
  MAX_SET_VOLUME: "weight",
  MAX_SESSION_VOLUME: "weight",
};

export interface PrEntry {
  type: PrType;
  /** Rep count for REP_MAX, else 0. */
  reps: number;
  value: number;
  previousValue: number | null;
  localDate: LocalDate;
  achievedAt: string;
}

export interface PrSeriesBlock {
  seriesKey: string;
  exerciseId: string;
  exerciseName: string;
  seriesLabel: string;
  modality: Modality;
  records: PrEntry[];
}

export interface PrBoard {
  /** Newest achievement first; at most `recentLimit`. */
  recent: (PrEntry & { seriesKey: string; exerciseId: string; exerciseName: string; seriesLabel: string })[];
  /** One block per series, most recently improved first. */
  series: PrSeriesBlock[];
}

const typeRank = (t: PrType) => PR_TYPE_ORDER.indexOf(t);

export function buildPrBoard(input: {
  rows: PersonalRecordRow[];
  exercises: Pick<ExerciseMeta, "id" | "name" | "modality">[];
  machineProfiles: MachineProfileMeta[];
  /** workoutId -> Workout.localDate (records are shown on the day the workout was logged). */
  workoutDates: ReadonlyMap<string, LocalDate>;
  recentLimit?: number;
}): PrBoard {
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e]));
  const machineById = new Map(input.machineProfiles.map((m) => [m.id, m]));
  const blocks = new Map<string, PrSeriesBlock>();

  for (const row of input.rows) {
    const exercise = exerciseById.get(row.exerciseId);
    if (!exercise) continue;
    const block = blocks.get(row.seriesKey) ?? {
      seriesKey: row.seriesKey,
      exerciseId: row.exerciseId,
      exerciseName: exercise.name,
      seriesLabel: seriesLabel(row.machineProfileId ? machineById.get(row.machineProfileId) : null),
      modality: exercise.modality,
      records: [],
    };
    block.records.push({
      type: row.type,
      reps: row.reps,
      value: row.value,
      previousValue: row.previousValue,
      localDate: input.workoutDates.get(row.workoutId) ?? row.achievedAt.slice(0, 10),
      achievedAt: row.achievedAt,
    });
    blocks.set(row.seriesKey, block);
  }

  for (const b of blocks.values()) b.records.sort((a, c) => typeRank(a.type) - typeRank(c.type) || a.reps - c.reps);
  const newest = (b: PrSeriesBlock) => b.records.reduce((m, r) => (r.achievedAt > m ? r.achievedAt : m), "");
  const series = [...blocks.values()].sort((a, b) => newest(b).localeCompare(newest(a)) || a.exerciseName.localeCompare(b.exerciseName));

  const recent = series
    .flatMap((b) => b.records.map((r) => ({ ...r, seriesKey: b.seriesKey, exerciseId: b.exerciseId, exerciseName: b.exerciseName, seriesLabel: b.seriesLabel })))
    // a first-ever record for a series (no previous value) is not news; improvements are
    .filter((r) => r.previousValue != null)
    .sort((a, b) => b.achievedAt.localeCompare(a.achievedAt))
    .slice(0, input.recentLimit ?? 8);

  return { recent, series };
}
