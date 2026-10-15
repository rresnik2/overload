import clsx from "clsx";
import Link from "next/link";
import { InfoHint } from "@/components/ui/InfoHint";
import { MODALITY_LABEL } from "@/components/exercises/labels";
import { modalityColor, modalityShape, plural } from "@/components/charts/format";
import type { SeriesRef } from "@/server/queries/progress.shape";

const SHAPE_CLASS = { circle: "series-picker__swatch--circle", square: "series-picker__swatch--square", diamond: "series-picker__swatch--diamond", triangle: "series-picker__swatch--triangle" } as const;

/**
 * One link per progression series of an exercise (the default series, then one per machine profile). A machine at another gym is a
 * different series, never merged. Plain links: works without JS and keeps the choice in the URL (?series=).
 */
export function SeriesPicker({ exerciseId, series, selectedKey }: { exerciseId: string; series: SeriesRef[]; selectedKey: string }) {
  if (series.length < 2) return null;
  return (
    <nav aria-label="Progression series" className="series-picker" data-testid="series-picker">
      <ul className="series-picker__list">
        {series.map((s) => {
          const active = s.seriesKey === selectedKey;
          return (
            <li key={s.seriesKey}>
              <Link
                href={`/progress/${exerciseId}?series=${encodeURIComponent(s.seriesKey)}`}
                className={clsx("series-picker__item", active && "series-picker__item--active")}
                aria-current={active ? "page" : undefined}
                data-series-key={s.seriesKey}
                scroll={false}
              >
                <span className={clsx("series-picker__swatch", SHAPE_CLASS[modalityShape(s.modality)])} style={{ background: modalityColor(s.modality) }} aria-hidden="true" />
                <span className="series-picker__text">
                  <span className="series-picker__label">{s.label}</span>
                  <span className="series-picker__meta num">
                    {MODALITY_LABEL[s.modality]} / {plural(s.sessions, "session")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <InfoHint term="progressSeries" />
    </nav>
  );
}
