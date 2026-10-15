import clsx from "clsx";
import { Star } from "lucide-react";
import type { ReactNode } from "react";

export interface StatProps {
  /** Small caps label under the numeral ("Estimated 1RM"). */
  label: string;
  /** The headline value (tabular figures, so a live-updating number keeps its width). */
  value: ReactNode;
  /** Trailing unit in the label style ("kg"). */
  unit?: string;
  /** sm | md (default) | lg. */
  size?: "sm" | "md" | "lg";
  /** PR variant: a filled plate-red star next to the numeral and an accessible "Personal record" note. */
  pr?: boolean;
  /** Skeleton while data loads (keeps the layout stable). */
  loading?: boolean;
  /** Secondary line ("+2.5 kg vs last month"). */
  note?: ReactNode;
  className?: string;
}

/** Big condensed italic numeral (the readout style) + small caps label. Server-renderable. */
export function Stat({ label, value, unit, size = "md", pr = false, loading = false, note, className }: StatProps) {
  return (
    <div className={clsx("stat-o", `stat-o--${size}`, pr && "stat-o--pr", loading && "stat-o--loading", className)} aria-busy={loading || undefined}>
      <div className="stat-o__value">
        {loading ? (
          <span className="stat-o__skeleton" aria-hidden="true" />
        ) : (
          <>
            <span className="stat-o__numeral num">{value}</span>
            {unit ? <span className="stat-o__unit">{unit}</span> : null}
            {pr ? (
              <>
                <Star className="stat-o__star" aria-hidden="true" fill="currentColor" strokeWidth={0} />
                <span className="sr-only">Personal record</span>
              </>
            ) : null}
          </>
        )}
      </div>
      <div className="stat-o__label">{label}</div>
      {note && !loading ? <div className="stat-o__note">{note}</div> : null}
      {loading ? <span className="sr-only">Loading</span> : null}
    </div>
  );
}
