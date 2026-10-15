// Weekly volume: fractional hard sets per muscle (docs/research.md "Training variables").
import type { IsHardSet, MuscleVolume, VolumeBand, VolumeStatus, WeeklyMuscleVolume } from "@/contracts/analytics";
import type { Muscle, TrainingGoal } from "@/contracts/enums";
import { addDays } from "@/lib/dates";
import {
  DEFAULT_VOLUME_GOAL,
  HARD_SET_MAX_RIR,
  PRIMARY_SET_WEIGHT,
  SECONDARY_SET_WEIGHT,
  VOLUME_BANDS,
} from "./constants";

/**
 * A hard set is a completed set that is not a warm-up, with RIR <= 4 or not recorded. A set that records neither
 * reps nor a duration did no countable work and is not a hard set. DROP and AMRAP sets count.
 */
export const isHardSet: IsHardSet = ({ setType, rir, reps, durationSec }) => {
  if (setType === "WARMUP") return false;
  const didWork = (reps != null && reps >= 1) || (durationSec != null && durationSec > 0);
  if (!didWork) return false;
  return rir == null || rir <= HARD_SET_MAX_RIR;
};

/** The weekly band for a goal (hypertrophy 10-20 by default). */
export function volumeBand(goal: TrainingGoal | null): VolumeBand {
  const band = VOLUME_BANDS[goal ?? DEFAULT_VOLUME_GOAL];
  return { low: band.low, high: band.high };
}

export function volumeStatus(fractionalSets: number, band: VolumeBand): VolumeStatus {
  if (fractionalSets <= 0) return "none";
  if (fractionalSets < band.low) return "below";
  if (fractionalSets > band.high) return "above";
  return "within";
}

/** Fractional hard sets per muscle for one ISO week: primary 1.0, secondary 0.5, machines count fully. */
export const weeklyMuscleVolume: WeeklyMuscleVolume = ({ sets, exercises, weekStart, goal }) => {
  const weekEnd = addDays(weekStart, 6);
  const muscleByExercise = new Map<string, Map<Muscle, number>>();
  for (const ex of exercises) {
    const weights = new Map<Muscle, number>();
    for (const m of ex.muscles) {
      // a muscle listed as both PRIMARY and SECONDARY counts once, as primary
      const w = m.role === "PRIMARY" ? PRIMARY_SET_WEIGHT : SECONDARY_SET_WEIGHT;
      weights.set(m.muscle, Math.max(weights.get(m.muscle) ?? 0, w));
    }
    muscleByExercise.set(ex.id, weights);
  }

  const band = volumeBand(goal);
  const acc = new Map<Muscle, { fractional: number; hard: number; direct: number; indirect: number }>();
  for (const set of sets) {
    if (set.localDate < weekStart || set.localDate > weekEnd) continue;
    if (!isHardSet(set)) continue;
    const weights = muscleByExercise.get(set.exerciseId);
    if (!weights) continue;
    for (const [muscle, weight] of weights) {
      const cur = acc.get(muscle) ?? { fractional: 0, hard: 0, direct: 0, indirect: 0 };
      cur.fractional += weight;
      cur.hard += 1;
      if (weight === PRIMARY_SET_WEIGHT) cur.direct += 1;
      else cur.indirect += 1;
      acc.set(muscle, cur);
    }
  }

  const out: MuscleVolume[] = [];
  for (const [muscle, v] of acc) {
    out.push({
      muscle,
      fractionalSets: v.fractional,
      hardSets: v.hard,
      directSets: v.direct,
      indirectSets: v.indirect,
      band: { ...band },
      status: volumeStatus(v.fractional, band),
    });
  }
  // fractionalSets descending, muscle name as the deterministic tie-break (so the result never depends on set order)
  return out.sort((a, b) => b.fractionalSets - a.fractionalSets || a.muscle.localeCompare(b.muscle));
};
