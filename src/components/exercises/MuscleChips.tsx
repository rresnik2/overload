import clsx from "clsx";
import type { ExerciseMuscleEntry } from "@/contracts/entities";
import { MUSCLE_LABEL } from "./labels";

/**
 * The muscles an exercise trains: primary muscles are solid chips, secondary muscles are outlined.
 * `max` limits how many chips show (primary first); the rest collapse to "+N". Props only.
 */
export interface MuscleChipsProps {
  muscles: ExerciseMuscleEntry[];
  max?: number;
  className?: string;
}

export function MuscleChips({ muscles, max, className }: MuscleChipsProps) {
  if (muscles.length === 0) return null;
  const ordered = [...muscles].sort((a, b) => Number(b.role === "PRIMARY") - Number(a.role === "PRIMARY"));
  const shown = max === undefined ? ordered : ordered.slice(0, max);
  const hidden = ordered.length - shown.length;
  return (
    <ul className={clsx("muscle-chips", className)} aria-label="Muscles trained">
      {shown.map((m) => (
        <li key={m.muscle} className={clsx("muscle-chip", m.role === "PRIMARY" ? "muscle-chip--primary" : "muscle-chip--secondary")} title={m.role === "PRIMARY" ? "Primary" : "Secondary"}>
          {MUSCLE_LABEL[m.muscle]}
        </li>
      ))}
      {hidden > 0 ? <li className="muscle-chip muscle-chip--more num">+{hidden}</li> : null}
    </ul>
  );
}
