// Stall detection and double-progression nudges (docs/research.md "Training variables", "Progressing load").
import type { DetectStall, ProgressionInput, ProgressionSuggestion, SetFact, SuggestProgression } from "@/contracts/analytics";
import { addDays, diffDays } from "@/lib/dates";
import { round } from "@/lib/units";
import {
  BIG_JUMP_MAX_REPS,
  INCREMENT_MAX_FRACTION,
  INCREMENT_MIN_FRACTION,
  NOISE_THRESHOLD,
  STALL_MIN_SESSIONS_PER_WINDOW,
  STALL_WINDOW_WEEKS,
  TWO_FOR_TWO_EXTRA_REPS,
  TWO_FOR_TWO_SESSIONS,
} from "./constants";

/**
 * Stalled = the best e1RM of the last 6 weeks is not at least ~5% above the best of the 6 weeks before (a smaller
 * change is test-retest noise, grgic2020). Deload sessions are ignored. Needs >= 2 sessions in each window, else
 * `changePct` is null and the lift is not called stalled.
 */
export const detectStall: DetectStall = (points, today) => {
  const windowDays = STALL_WINDOW_WEEKS * 7;
  const recentFrom = addDays(today, -(windowDays - 1));
  const baseFrom = addDays(today, -(2 * windowDays - 1));
  const live = points.filter((p) => !p.isDeload && p.localDate >= baseFrom && p.localDate <= today);
  const recent = live.filter((p) => p.localDate >= recentFrom);
  const baseline = live.filter((p) => p.localDate < recentFrom);

  const dates = live.map((p) => p.localDate).sort();
  const weeksSpanned = dates.length ? round(diffDays(dates[0]!, dates[dates.length - 1]!) / 7, 1) : 0;
  const base = { sessions: live.length, weeksSpanned };
  if (recent.length < STALL_MIN_SESSIONS_PER_WINDOW || baseline.length < STALL_MIN_SESSIONS_PER_WINDOW) {
    return { stalled: false, ...base, changePct: null };
  }
  const best = (ps: typeof live) => Math.max(...ps.map((p) => p.e1rmKg));
  const changePct = round((best(recent) / best(baseline) - 1) * 100, 1);
  return { stalled: changePct < NOISE_THRESHOLD * 100, ...base, changePct };
};

export interface SessionLastSet {
  localDate: string;
  /** Reps of the LAST working set of the session. */
  reps: number;
  loadKg: number | null;
}

/** The last working set (not warm-up/drop) of each session, oldest session first. */
export function lastWorkingSetPerSession(sets: SetFact[]): SessionLastSet[] {
  const working = sets
    .filter((s) => s.setType !== "WARMUP" && s.setType !== "DROP" && s.reps != null && s.reps >= 1)
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || a.completedAt.localeCompare(b.completedAt));
  const last = new Map<string, SessionLastSet>();
  for (const s of working) {
    last.set(s.localDate, { localDate: s.localDate, reps: s.reps as number, loadKg: s.effectiveLoadKg });
  }
  return [...last.values()].sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export interface ProgressionEvaluation {
  suggestion: ProgressionSuggestion;
  /** The last set beat the target by 2 reps at the same load in two sessions in a row. */
  twoForTwo: boolean;
  /** A machine whose smallest jump exceeds 10% of the current load. */
  bigJump: boolean;
}

export function evaluateProgression(input: ProgressionInput): ProgressionEvaluation {
  const { repMin, repMax, incrementKg, currentLoadKg, modality } = input;
  const stay = (kind: ProgressionSuggestion["kind"], nextRepTarget: number | null, rationale: string, flags: Partial<ProgressionEvaluation> = {}): ProgressionEvaluation => ({
    suggestion: { kind, nextLoadKg: currentLoadKg, nextRepTarget, rationale },
    twoForTwo: flags.twoForTwo ?? false,
    bigJump: flags.bigJump ?? false,
  });

  const sessions = lastWorkingSetPerSession(input.sets);
  if (sessions.length < TWO_FOR_TWO_SESSIONS) {
    return stay("hold", repMax, "Log at least two sessions at the same load before progressing: the 2-for-2 rule needs them.");
  }
  if (!(currentLoadKg > 0) || !(incrementKg > 0)) {
    return stay("hold", repMax, "No usable load or increment to progress from.");
  }

  const recent = sessions.slice(-TWO_FOR_TWO_SESSIONS);
  const lastReps = recent[recent.length - 1]!.reps;
  const sameLoad = recent.every((s, i) => i === 0 || s.loadKg == null || recent[0]!.loadKg == null || Math.abs(s.loadKg - recent[0]!.loadKg) <= 0.01);
  const twoForTwo = sameLoad && recent.every((s) => s.reps >= repMax + TWO_FOR_TWO_EXTRA_REPS);

  if (twoForTwo) {
    const ratio = incrementKg / currentLoadKg;
    const isStackMachine = modality === "MACHINE" || modality === "CABLE";
    const bigJump = isStackMachine && ratio > INCREMENT_MAX_FRACTION;
    if (bigJump) {
      // The next pin would cut reps by roughly the e1RM ratio; land mid-range after the jump (Epley) before taking it.
      const mid = (repMin + repMax) / 2;
      const needed = Math.ceil(30 * ((1 + ratio) * (1 + mid / 30) - 1));
      if (needed > lastReps && needed <= BIG_JUMP_MAX_REPS) {
        return stay(
          "add_reps",
          needed,
          `The next jump is ${round(ratio * 100, 0)}% of your load (above ${INCREMENT_MAX_FRACTION * 100}%), so add reps first: aim for ${needed} reps, then take the jump.`,
          { twoForTwo, bigJump },
        );
      }
    }
    // Increments are 2-10% of the load: use several of the smallest jumps when one is under 2%.
    const steps = Math.max(1, Math.ceil((INCREMENT_MIN_FRACTION * currentLoadKg) / incrementKg - 1e-9));
    const nextLoadKg = round(currentLoadKg + steps * incrementKg, 3);
    return {
      suggestion: {
        kind: "add_load",
        nextLoadKg,
        nextRepTarget: repMin,
        rationale: `Your last set beat the ${repMax}-rep target by ${TWO_FOR_TWO_EXTRA_REPS}+ reps in ${TWO_FOR_TWO_SESSIONS} sessions in a row (2-for-2): add load and restart at ${repMin} reps.`,
      },
      twoForTwo,
      bigJump,
    };
  }

  if (lastReps < repMax) {
    const target = Math.min(repMax, Math.max(repMin, lastReps + 1));
    return stay("add_reps", target, `Stay at this load and aim for ${target} reps on your last set (top of the range is ${repMax}).`);
  }
  return stay(
    "hold",
    repMax + TWO_FOR_TWO_EXTRA_REPS,
    `You reached ${repMax} reps. Keep the load until your last set reaches ${repMax + TWO_FOR_TWO_EXTRA_REPS} reps in ${TWO_FOR_TWO_SESSIONS} sessions in a row (2-for-2).`,
  );
}

/** Double progression with the 2-for-2 rule: add load when the last set beats the target by 2 reps in two sessions in a row. */
export const suggestProgression: SuggestProgression = (input) => evaluateProgression(input).suggestion;
