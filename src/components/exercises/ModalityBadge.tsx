import clsx from "clsx";
import type { Equipment, Modality } from "@/contracts/enums";
import { EQUIPMENT_LABEL, MODALITY_LABEL } from "./labels";

/**
 * A small tag naming how an exercise is loaded: "Free weight", "Machine", "Cable", ... Machine and cable tags are filled
 * (ink) and free-weight tags are outlined, so the two are never confused in a list. Props only.
 */
export interface ModalityBadgeProps {
  modality: Modality;
  /** When given, the finer equipment is appended: "Free weight / Barbell". */
  equipment?: Equipment;
  className?: string;
}

export function ModalityBadge({ modality, equipment, className }: ModalityBadgeProps) {
  const showEquipment = equipment && EQUIPMENT_LABEL[equipment] !== MODALITY_LABEL[modality];
  return (
    <span className={clsx("modality-badge", `modality-badge--${modality.toLowerCase().replace(/_/g, "-")}`, className)} data-modality={modality}>
      {MODALITY_LABEL[modality]}
      {showEquipment ? (
        <>
          <span className="modality-badge__slash" aria-hidden="true">
            /
          </span>
          {EQUIPMENT_LABEL[equipment]}
        </>
      ) : null}
    </span>
  );
}
