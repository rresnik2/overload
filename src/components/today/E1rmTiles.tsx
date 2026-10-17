import type { CSSProperties } from "react";
import { TILE_LIFT_PLATE, type LiftTile } from "@/lib/analytics/lifts";
import { formatNumber, fromKg, round, type WeightUnit } from "@/lib/units";

const unitText = (unit: WeightUnit) => (unit === "LB" ? "lb" : "kg");

/** "+7.5 kg", "−2.5 kg" (a real minus sign), or "flat" when the change is exactly 0; null without a 4-week baseline. */
export function changeText(changeKg: number | null, unit: WeightUnit): { text: string; tone: "up" | "down" | "flat" | "none" } {
  if (changeKg == null) return { text: "No 4-week change yet", tone: "none" };
  if (changeKg === 0) return { text: "flat", tone: "flat" };
  const shown = round(fromKg(Math.abs(changeKg), unit), 1);
  const text = `${changeKg > 0 ? "+" : "−"}${formatNumber(shown, 1)} ${unitText(unit)}`;
  return { text, tone: changeKg > 0 ? "up" : "down" };
}

/**
 * The four main lifts as tiles: the current estimated 1RM, its change over 4 weeks and a left edge in the lift's plate colour.
 * A lift with no history says how to get an estimate. Server-renderable; values arrive in kg and are shown in `unit`.
 */
export function E1rmTiles({ tiles, unit }: { tiles: LiftTile[]; unit: WeightUnit }) {
  return (
    <ul className="today-tiles" data-testid="e1rm-tiles">
      {tiles.map((t) => {
        const e1rmKg = t.e1rmKg;
        const empty = e1rmKg == null;
        const change = changeText(t.changeKg, unit);
        return (
          <li
            key={t.lift}
            className="today-tile"
            data-lift={t.lift}
            data-state={empty ? "empty" : "filled"}
            style={{ "--lift": `var(--plate-${TILE_LIFT_PLATE[t.lift]})` } as CSSProperties}
          >
            <span className="today-tile__name">{t.name}</span>
            {e1rmKg == null ? (
              <>
                <span className="today-tile__value today-tile__value--empty type-display-m num" aria-hidden="true">
                  —
                </span>
                <span className="today-tile__delta today-tile__delta--none">Log a set to see your estimate</span>
              </>
            ) : (
              <>
                <span className="today-tile__value type-display-m num">
                  {formatNumber(fromKg(e1rmKg, unit), 1)}
                  <small>{unitText(unit)}</small>
                </span>
                <span className={`today-tile__delta today-tile__delta--${change.tone} num`}>
                  {change.text}
                  {change.tone !== "none" ? <span className="sr-only"> over 4 weeks</span> : null}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
