// PR detection (pure): shared by the server rebuild (per seriesKey, inside the sync transaction) and the client's live toast.
//
// A set counts only when it is completed (completedAt != null) and not a WARMUP or DROP set. Per series:
//   E1RM              best e1rmKg
//   MAX_LOAD          best effectiveLoadKg (reps >= 1)
//   REP_MAX           best effectiveLoadKg for exactly N reps (one row per N)
//   MAX_REPS          most reps in one set, for sets WITHOUT an effective load (bodyweight-only / unknown bodyweight / no-load
//                     work); loaded sets are already tracked per rep count by REP_MAX
//   MAX_SET_VOLUME    best effectiveLoadKg x reps
//   MAX_SESSION_VOLUME best per-workout sum of effectiveLoadKg x reps (setId null)
// Ties keep the EARLIEST achievement. Values are rounded to the database precision (3 dp).
import type { ComputeSeriesPrs, DetectNewPrs, PrCandidate, PrSetInput } from "@/contracts/prs";
import type { PrType } from "@/contracts/enums";
import { round } from "@/lib/units";

const DP = 3;
const TYPE_ORDER: PrType[] = ["E1RM", "MAX_LOAD", "REP_MAX", "MAX_REPS", "MAX_SET_VOLUME", "MAX_SESSION_VOLUME"];

function counts(set: PrSetInput): boolean {
  return set.completedAt != null && set.setType !== "WARMUP" && set.setType !== "DROP";
}

function candidateKey(c: Pick<PrCandidate, "type" | "reps">): string {
  return `${c.type}:${c.reps}`;
}

/** true when `a` is the earlier achievement (deterministic: time, then set id). */
function earlier(a: PrCandidate, b: PrCandidate): boolean {
  if (a.achievedAt !== b.achievedAt) return a.achievedAt < b.achievedAt;
  return (a.setId ?? "") < (b.setId ?? "");
}

function consider(best: Map<string, PrCandidate>, candidate: PrCandidate): void {
  if (!(candidate.value > 0)) return;
  const key = candidateKey(candidate);
  const current = best.get(key);
  if (!current || candidate.value > current.value || (candidate.value === current.value && earlier(candidate, current))) {
    best.set(key, candidate);
  }
}

function computeOneSeries(sets: PrSetInput[]): PrCandidate[] {
  const best = new Map<string, PrCandidate>();
  const sessions = new Map<string, { volume: number; achievedAt: string; set: PrSetInput }>();

  for (const set of sets) {
    if (!counts(set)) continue;
    const achievedAt = set.completedAt as string;
    const base = {
      seriesKey: set.seriesKey,
      exerciseId: set.exerciseId,
      machineProfileId: set.machineProfileId,
      setId: set.id,
      workoutId: set.workoutId,
      achievedAt,
    };
    const reps = set.reps ?? 0;
    const load = set.effectiveLoadKg;

    if (set.e1rmKg != null) consider(best, { ...base, type: "E1RM", reps: 0, value: round(set.e1rmKg, DP) });
    if (reps >= 1 && load != null && load > 0) {
      consider(best, { ...base, type: "MAX_LOAD", reps: 0, value: round(load, DP) });
      consider(best, { ...base, type: "REP_MAX", reps, value: round(load, DP) });
      consider(best, { ...base, type: "MAX_SET_VOLUME", reps: 0, value: round(load * reps, DP) });
      const session = sessions.get(set.workoutId);
      if (!session) sessions.set(set.workoutId, { volume: load * reps, achievedAt, set });
      else {
        session.volume += load * reps;
        if (achievedAt > session.achievedAt) session.achievedAt = achievedAt;
      }
    }
    if (reps >= 1 && (load == null || load <= 0)) consider(best, { ...base, type: "MAX_REPS", reps: 0, value: reps });
  }

  for (const [workoutId, session] of sessions) {
    consider(best, {
      seriesKey: session.set.seriesKey,
      exerciseId: session.set.exerciseId,
      machineProfileId: session.set.machineProfileId,
      type: "MAX_SESSION_VOLUME",
      reps: 0,
      value: round(session.volume, DP),
      setId: null,
      workoutId,
      achievedAt: session.achievedAt,
    });
  }

  return [...best.values()].sort(
    (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.reps - b.reps,
  );
}

export const computeSeriesPrs: ComputeSeriesPrs = (sets) => {
  const bySeries = new Map<string, PrSetInput[]>();
  for (const set of sets) {
    const list = bySeries.get(set.seriesKey);
    if (list) list.push(set);
    else bySeries.set(set.seriesKey, [set]);
  }
  return [...bySeries.keys()].sort().flatMap((key) => computeOneSeries(bySeries.get(key) as PrSetInput[]));
};

export const detectNewPrs: DetectNewPrs = (history, newSet) => {
  if (!counts(newSet)) return [];
  const prior = history.filter((s) => s.id !== newSet.id && s.seriesKey === newSet.seriesKey);
  // The very first counted set of a series sets every record trivially: not a PR worth announcing.
  if (!prior.some(counts)) return [];
  const before = new Map(computeSeriesPrs(prior).map((c) => [candidateKey(c), c.value]));
  return computeSeriesPrs([...prior, newSet]).filter((c) => {
    const touchesNewSet = c.setId === newSet.id || (c.type === "MAX_SESSION_VOLUME" && c.workoutId === newSet.workoutId);
    if (!touchesNewSet) return false;
    const previous = before.get(candidateKey(c));
    return previous === undefined || c.value > previous;
  });
};
