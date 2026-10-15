// Shared, pure helpers for the insight rules and the weekly facts builder.
import type { AnalyticsInput, ExerciseMeta, InsightCard, MachineProfileMeta, SessionPoint, SetFact } from "@/contracts/analytics";
import type { Muscle } from "@/contracts/enums";
import { addDays, isoWeekStart } from "@/lib/dates";
import { round } from "@/lib/units";
import { CARD_BODY_MAX, CITATIONS } from "../constants";
import { sessionBestE1rm } from "../series";
import { bodyweightPoints } from "../scores";

export interface SeriesInfo {
  seriesKey: string;
  exerciseId: string;
  machineProfileId: string | null;
  exercise: ExerciseMeta | undefined;
  machine: MachineProfileMeta | undefined;
  label: string;
  /** Machine series are never compared with barbell numbers; true only for free-weight work. */
  isMachine: boolean;
  /** Every completed set of the series up to `today`, oldest first. */
  sets: SetFact[];
  /** Session-best e1RM points (profile formula). */
  points: SessionPoint[];
}

export function muscleName(muscle: Muscle): string {
  return muscle.toLowerCase().replace(/_/g, " ");
}

export function seriesLabel(exercise: ExerciseMeta | undefined, machine: MachineProfileMeta | undefined): string {
  const name = exercise?.name ?? "Unknown exercise";
  if (!machine) return name;
  return machine.gymName ? `${name} (${machine.name} @ ${machine.gymName})` : `${name} (${machine.name})`;
}

/** One entry per seriesKey, sorted by key. Sets after `today` are ignored. Series never merge. */
export function buildSeries(input: AnalyticsInput): SeriesInfo[] {
  const exercises = new Map(input.exercises.map((e) => [e.id, e]));
  const machines = new Map(input.machineProfiles.map((m) => [m.id, m]));
  const bySeries = new Map<string, SetFact[]>();
  for (const s of input.sets) {
    if (s.localDate > input.today) continue;
    const list = bySeries.get(s.seriesKey);
    if (list) list.push(s);
    else bySeries.set(s.seriesKey, [s]);
  }
  return [...bySeries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([seriesKey, sets]) => {
      const first = sets[0]!;
      const exercise = exercises.get(first.exerciseId);
      const machine = first.machineProfileId ? machines.get(first.machineProfileId) : undefined;
      return {
        seriesKey,
        exerciseId: first.exerciseId,
        machineProfileId: first.machineProfileId,
        exercise,
        machine,
        label: seriesLabel(exercise, machine),
        isMachine: first.machineProfileId != null || exercise?.modality === "MACHINE" || exercise?.modality === "CABLE",
        sets,
        points: sessionBestE1rm(sets, { formula: input.profile.e1rmFormula }),
      };
    });
}

/** The last COMPLETED ISO week before `today` (the week the weekly rules judge). */
export function lastCompleteWeek(today: string): { weekStart: string; weekEnd: string } {
  const weekStart = addDays(isoWeekStart(today), -7);
  return { weekStart, weekEnd: addDays(weekStart, 6) };
}

/** Body weight per date: body metrics first, else the workout's bodyweight. Oldest first, deduplicated by date. */
export function bodyweightSeries(input: AnalyticsInput): { localDate: string; weightKg: number }[] {
  const byDate = new Map<string, number>();
  for (const s of input.sets) {
    if (s.workoutBodyweightKg != null && s.workoutBodyweightKg > 0 && s.localDate <= input.today) byDate.set(s.localDate, s.workoutBodyweightKg);
  }
  for (const p of bodyweightPoints(input.bodyMetrics)) {
    if (p.localDate <= input.today) byDate.set(p.localDate, p.weightKg);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([localDate, weightKg]) => ({ localDate, weightKg }));
}

export function latestBodyweightKg(input: AnalyticsInput): number | null {
  const series = bodyweightSeries(input);
  return series.length ? series[series.length - 1]!.weightKg : null;
}

export function firstWorkoutDate(input: AnalyticsInput): string | null {
  return input.sets.length ? input.sets.reduce((min, s) => (s.localDate < min ? s.localDate : min), input.sets[0]!.localDate) : null;
}

export const r1 = (n: number) => round(n, 1);

/** Build a card; text is clipped to the schema limits and every citation must exist in CITATIONS. */
export function makeCard(card: InsightCard): InsightCard {
  for (const key of card.citations) {
    if (!(key in CITATIONS)) throw new Error(`unknown citation key: ${key}`);
  }
  return { ...card, title: card.title.slice(0, 160), body: card.body.slice(0, CARD_BODY_MAX), evidence: card.evidence.slice(0, 12) };
}
