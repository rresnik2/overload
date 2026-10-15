// Defaults the custom-exercise form applies when the modality changes. PURE.
import type { Equipment, LoadType, Modality } from "@/contracts/enums";

export const MODALITY_DEFAULTS: Record<Modality, { equipment: Equipment; loadType: LoadType }> = {
  FREE_WEIGHT: { equipment: "BARBELL", loadType: "TOTAL" },
  MACHINE: { equipment: "MACHINE_SELECTORIZED", loadType: "STACK" },
  CABLE: { equipment: "CABLE", loadType: "STACK" },
  BODYWEIGHT: { equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS" },
  BAND: { equipment: "BAND", loadType: "NONE" },
  OTHER: { equipment: "OTHER", loadType: "TOTAL" },
};

export const EXERCISE_CATEGORY_NOTE: Record<Modality, string> = {
  FREE_WEIGHT: "Barbells, dumbbells, kettlebells. One progression line per exercise.",
  MACHINE: "Each machine you use keeps its own progress; you pick the machine when you log it.",
  CABLE: "Each cable station keeps its own progress; you pick the station when you log it.",
  BODYWEIGHT: "Your bodyweight counts toward the load; log any weight added on top.",
  BAND: "Bands have no weight to log.",
  OTHER: "Anything else.",
};
