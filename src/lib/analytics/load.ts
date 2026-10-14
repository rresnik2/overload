// Effective load per LoadType. IMPLEMENTED in Phase 0 (frozen behaviour).
//   TOTAL: the number entered           PER_IMPLEMENT: x 2 (x 1 if the exercise is unilateral)
//   PLATES_PER_SIDE: 2 x entry + the machine's base load   STACK: the stack number entered
//   BODYWEIGHT_PLUS: bodyweight x factor + added load      NONE: no load (null)
import type { EffectiveLoadKg } from "@/contracts/analytics";
import { round } from "@/lib/units";
import { KG_DP } from "./constants";

export const effectiveLoadKg: EffectiveLoadKg = ({
  loadType,
  weightKg,
  isUnilateral,
  bodyweightKg,
  bodyweightFactor,
  baseLoadKg,
}) => {
  const entered = weightKg != null && Number.isFinite(weightKg) ? weightKg : null;

  switch (loadType) {
    case "TOTAL":
    case "STACK":
      return entered == null ? null : round(entered, KG_DP);
    case "PER_IMPLEMENT":
      return entered == null ? null : round(entered * (isUnilateral ? 1 : 2), KG_DP);
    case "PLATES_PER_SIDE":
      return entered == null ? null : round(2 * entered + (baseLoadKg ?? 0), KG_DP);
    case "BODYWEIGHT_PLUS": {
      if (bodyweightKg == null || !Number.isFinite(bodyweightKg) || bodyweightKg <= 0) return null;
      return round(bodyweightKg * (bodyweightFactor ?? 1) + (entered ?? 0), KG_DP);
    }
    case "NONE":
      return null;
  }
};
