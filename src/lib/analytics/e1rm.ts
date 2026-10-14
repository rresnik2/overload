// Estimated 1RM. IMPLEMENTED in Phase 0 (frozen behaviour; stream D may add tests, not change the maths).
// Epley with RIR folded in: w * (1 + (reps + RIR) / 30). Brzycki is the user-selectable alternative (36w / (37 - r)).
import type { Estimate1RM } from "@/contracts/analytics";
import { round } from "@/lib/units";
import { E1RM_LOW_CONFIDENCE_ABOVE_REPS, E1RM_MAX_EFFECTIVE_REPS, KG_DP } from "./constants";

export const estimate1RM: Estimate1RM = ({ weightKg, reps, rir, formula = "EPLEY" }) => {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return null;
  if (!Number.isFinite(reps) || reps < 1) return null;
  const effectiveReps = reps + Math.max(0, rir ?? 0);
  if (effectiveReps > E1RM_MAX_EFFECTIVE_REPS) return null;

  let e1rm: number;
  if (effectiveReps <= 1) {
    // A single rep with no RIR IS the 1RM: no extrapolation.
    e1rm = weightKg;
  } else if (formula === "BRZYCKI") {
    e1rm = (36 * weightKg) / (37 - effectiveReps);
  } else {
    e1rm = weightKg * (1 + effectiveReps / 30);
  }

  return {
    e1rmKg: round(e1rm, KG_DP),
    confidence: effectiveReps > E1RM_LOW_CONFIDENCE_ABOVE_REPS ? "low" : "high",
    formula,
    effectiveReps,
  };
};
