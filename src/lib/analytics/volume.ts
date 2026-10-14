// Weekly volume. STUB (stream D implements; do not change the exported signatures).
import type { IsHardSet, WeeklyMuscleVolume } from "@/contracts/analytics";

/** A hard set is a completed set that is not a warm-up, with RIR <= 4 or not recorded. */
export const isHardSet: IsHardSet = () => {
  throw new Error("not implemented: isHardSet");
};

/** Fractional hard sets per muscle for one ISO week: primary 1.0, secondary 0.5, machines count fully. */
export const weeklyMuscleVolume: WeeklyMuscleVolume = () => {
  throw new Error("not implemented: weeklyMuscleVolume");
};
