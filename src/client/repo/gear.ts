// "Gear profiles": the user's own dumbbell step and kettlebell set, stored as a MachineProfile with `equipment` set
// (DUMBBELL or KETTLEBELL), `exerciseId` null and `gymName` null. PURE.
//
// Dumbbells keep their step in `pinStepKg`; kettlebells keep the bells they own in `platesKg` (null = the standard sizes).
// Today there is one gear profile per equipment, user-wide (gymName null). Per-gym gear later is the same row shape with
// `gymName` set: `pickGear` already prefers a profile for the given gym and falls back to the user-wide one.
import type { MachineProfileRow } from "@/contracts/entities";
import type { Equipment } from "@/contracts/enums";
import type { GearEquipment } from "@/contracts/repo";

export type { GearEquipment };

export const GEAR_EQUIPMENT: readonly GearEquipment[] = ["DUMBBELL", "KETTLEBELL"];

export const isGearEquipment = (equipment: Equipment): equipment is GearEquipment => equipment === "DUMBBELL" || equipment === "KETTLEBELL";

type GearFields = Pick<MachineProfileRow, "equipment" | "gymName">;

/** A gear profile (dumbbell step or kettlebell set). Rows written before `equipment` existed lack it, so they are machines. */
export const isGearProfile = (p: Pick<MachineProfileRow, "equipment">): boolean => p.equipment != null && isGearEquipment(p.equipment);

/** A real machine or bar profile: everything that is not gear. Machine lists must filter with this. */
export const isMachineProfile = (p: Pick<MachineProfileRow, "equipment">): boolean => !isGearProfile(p);

/**
 * The gear profile of `equipment` among `rows`: the one for `gymName` when asked and present, else the user-wide one
 * (gymName null). Ties (two devices created the first one at the same time) resolve to the earliest-created, then the lowest id.
 */
export function pickGear<T extends GearFields & Pick<MachineProfileRow, "id" | "createdAt">>(rows: readonly T[], equipment: GearEquipment, gymName?: string | null): T | undefined {
  const mine = rows.filter((r) => r.equipment === equipment);
  const earliest = (list: T[]): T | undefined => list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  if (gymName) {
    const local = earliest(mine.filter((r) => r.gymName === gymName));
    if (local) return local;
  }
  return earliest(mine.filter((r) => r.gymName == null));
}
