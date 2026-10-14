// Personal-record detection contract. FROZEN after Phase 0. Implementation: stream E1 (src/lib/sync/prs.ts, pure).
// Used by the server (rebuild PRs per seriesKey inside the sync transaction) AND by the client (live "new PR" toast).
import type { IsoDateTime } from "./entities";
import type { PrType, SetType } from "./enums";

/** The columns PR logic reads from a set (works on server rows and Dexie rows alike). */
export interface PrSetInput {
  id: string;
  workoutId: string;
  exerciseId: string;
  machineProfileId: string | null;
  seriesKey: string;
  setType: SetType;
  /** null = planned set: never counts. */
  completedAt: IsoDateTime | null;
  reps: number | null;
  effectiveLoadKg: number | null;
  e1rmKg: number | null;
}

/** The current best value of one PR type for one series. (type, reps) is unique per series; reps = 0 unless REP_MAX. */
export interface PrCandidate {
  seriesKey: string;
  exerciseId: string;
  machineProfileId: string | null;
  type: PrType;
  reps: number;
  value: number;
  setId: string | null;
  workoutId: string;
  achievedAt: IsoDateTime;
}

/**
 * Current PRs for ONE series from its completed sets. WARMUP and DROP sets never count; planned sets (completedAt null) never count.
 *  E1RM: best e1rmKg.  MAX_LOAD: best effectiveLoadKg (reps >= 1).  REP_MAX: best effectiveLoadKg for exactly N reps (one row per N).
 *  MAX_REPS: most reps in a set (bodyweight/no-load work).  MAX_SET_VOLUME: best effectiveLoadKg x reps.
 *  MAX_SESSION_VOLUME: best per-workout sum of effectiveLoadKg x reps.
 * Ties keep the EARLIEST achievement. Machine series never merge: the caller passes one seriesKey at a time.
 */
export type ComputeSeriesPrs = (sets: PrSetInput[]) => PrCandidate[];

/** PRs that `newSet` would set against `history` (strictly better than the prior best): drives the live PR toast. */
export type DetectNewPrs = (history: PrSetInput[], newSet: PrSetInput) => PrCandidate[];
