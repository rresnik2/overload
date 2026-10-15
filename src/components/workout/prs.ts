// Live PR detection for the logging screens: which completed sets of a workout set a record against the sets before them.
import { repo } from "@/client/repo";
import type { PrCandidate, PrSetInput } from "@/contracts/prs";
import type { PrType, WeightUnit } from "@/contracts/enums";
import type { WorkoutSetRow } from "@/contracts/entities";
import { detectNewPrs } from "@/lib/sync/prs";
import { formatWeight } from "@/lib/units";

/** Every live set of the given progression series (all workouts). One indexed read per series: the PR history. */
export async function seriesHistory(seriesKeys: Iterable<string>): Promise<WorkoutSetRow[]> {
  const out: WorkoutSetRow[] = [];
  for (const key of new Set(seriesKeys)) out.push(...(await repo.sets.forSeries(key)));
  return out;
}

/** MAX_SESSION_VOLUME is a whole-session record: it would flag every late set of a big session, so set-level PRs skip it. */
const SET_LEVEL = (c: PrCandidate) => c.type !== "MAX_SESSION_VOLUME";

/**
 * For each completed set of `workoutId`: the PRs it set against the completed sets that came before it in the same
 * series (earlier workouts and earlier sets of this one). Sets with no PR are absent from the map.
 */
export function workoutPrs(allSets: PrSetInput[], workoutId: string): Map<string, PrCandidate[]> {
  const bySeries = new Map<string, PrSetInput[]>();
  for (const s of allSets) {
    const list = bySeries.get(s.seriesKey);
    if (list) list.push(s);
    else bySeries.set(s.seriesKey, [s]);
  }
  const out = new Map<string, PrCandidate[]>();
  for (const sets of bySeries.values()) {
    for (const set of sets) {
      if (set.workoutId !== workoutId || set.completedAt == null) continue;
      const done = set.completedAt;
      const before = sets.filter((s) => s.completedAt != null && (s.completedAt < done || (s.completedAt === done && s.id < set.id)));
      const prs = detectNewPrs(before, set).filter(SET_LEVEL);
      if (prs.length > 0) out.set(set.id, prs);
    }
  }
  return out;
}

const PRIORITY: PrType[] = ["E1RM", "MAX_LOAD", "REP_MAX", "MAX_SET_VOLUME", "MAX_REPS", "MAX_SESSION_VOLUME"];

/** The record worth naming in a toast when one set beat several. */
export function headlinePr(candidates: PrCandidate[]): PrCandidate | undefined {
  return [...candidates].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type))[0];
}

export function describePr(pr: Pick<PrCandidate, "type" | "reps" | "value">, unit: WeightUnit): string {
  const kg = (value: number) => formatWeight(value, unit);
  switch (pr.type) {
    case "E1RM":
      return `Estimated 1RM ${kg(pr.value)}`;
    case "MAX_LOAD":
      return `Heaviest set ${kg(pr.value)}`;
    case "REP_MAX":
      return `Best for ${pr.reps} ${pr.reps === 1 ? "rep" : "reps"}: ${kg(pr.value)}`;
    case "MAX_REPS":
      return `Most reps in a set: ${pr.value}`;
    case "MAX_SET_VOLUME":
      return `Set volume ${kg(pr.value)}`;
    case "MAX_SESSION_VOLUME":
      return `Session volume ${kg(pr.value)}`;
  }
}
