// Plain data shapes the exercise components take as props. PURE.
import type { Equipment, Modality } from "@/contracts/enums";

/** One progression series of an exercise for the signed-in user (a machine profile keeps its own series). */
export interface SeriesSummary {
  /** `exerciseId` or `exerciseId:machineProfileId` (see seriesKey in src/lib/ids.ts). */
  seriesKey: string;
  /** null = the default series (no machine profile). */
  machineProfile: { id: string; name: string; gymName: string | null; brand: string | null } | null;
  /** Completed sets logged in this series. */
  setCount: number;
  /** "YYYY-MM-DD" of the most recent completed set, null when none were logged yet. */
  lastLocalDate: string | null;
}

/** A modality tab in the library. */
export interface ModalityTab {
  modality: Modality | null;
  label: string;
  /** Exercises in this tab under the current muscle/text filters. */
  count: number;
  href: string;
  active: boolean;
}

export interface EquipmentOption {
  equipment: Equipment;
  count: number;
}
