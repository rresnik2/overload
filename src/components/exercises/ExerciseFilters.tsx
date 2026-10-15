import clsx from "clsx";
import Link from "next/link";
import { MUSCLE_VALUES } from "@/contracts/enums";
import { EQUIPMENT_LABEL, MODALITY_LABEL, MUSCLE_LABEL } from "./labels";
import { libraryHref, toSlug, type LibraryFilters } from "./library-url";
import type { EquipmentOption, ModalityTab } from "./types";

/**
 * Modality tabs plus a search / equipment / muscle form. State lives in the URL: the tabs are links and the form is a
 * plain GET form, so it works without JavaScript and every view is shareable. Props only.
 */
export interface ExerciseFiltersProps {
  /** Page the filters navigate to, e.g. "/exercises". */
  basePath: string;
  filters: LibraryFilters;
  /** Tabs in display order, with counts and hrefs already computed. */
  tabs: ModalityTab[];
  /** Equipment choices for the selected modality. */
  equipmentOptions: EquipmentOption[];
  className?: string;
}

export function ExerciseFilters({ basePath, filters, tabs, equipmentOptions, className }: ExerciseFiltersProps) {
  const filtered = Boolean(filters.equipment || filters.muscle || filters.q);
  return (
    <div className={clsx("exercise-filters", className)}>
      <nav aria-label="Exercise type" className="exercise-tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.modality ?? "all"}
            href={tab.href}
            className={clsx("exercise-tab", tab.active && "exercise-tab--active")}
            aria-current={tab.active ? "page" : undefined}
          >
            {tab.label}
            <span className="exercise-tab__count num">{tab.count}</span>
          </Link>
        ))}
      </nav>
      <form method="get" action={basePath} className="exercise-filter-form" role="search">
        {filters.modality ? <input type="hidden" name="modality" value={toSlug(filters.modality)} /> : null}
        <label className="exercise-filter-form__field exercise-filter-form__search">
          <span className="exercise-filter-form__label">Search</span>
          <input type="search" name="q" defaultValue={filters.q} placeholder="Squat, curl, row..." className="input input-bordered" autoComplete="off" />
        </label>
        <label className="exercise-filter-form__field">
          <span className="exercise-filter-form__label">Equipment</span>
          <select name="equipment" defaultValue={filters.equipment ? toSlug(filters.equipment) : ""} className="select select-bordered">
            <option value="">All equipment</option>
            {equipmentOptions.map((o) => (
              <option key={o.equipment} value={toSlug(o.equipment)}>
                {EQUIPMENT_LABEL[o.equipment]} ({o.count})
              </option>
            ))}
          </select>
        </label>
        <label className="exercise-filter-form__field">
          <span className="exercise-filter-form__label">Muscle</span>
          <select name="muscle" defaultValue={filters.muscle ? toSlug(filters.muscle) : ""} className="select select-bordered">
            <option value="">All muscles</option>
            {MUSCLE_VALUES.map((m) => (
              <option key={m} value={toSlug(m)}>
                {MUSCLE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <div className="exercise-filter-form__actions">
          <button type="submit" className="btn btn-neutral">
            Apply
          </button>
          {filtered ? (
            <Link href={libraryHref(basePath, filters, { equipment: null, muscle: null, q: "" })} className="btn btn-ghost">
              Clear
            </Link>
          ) : null}
        </div>
      </form>
      {filters.modality ? <p className="exercise-filters__note">Showing {MODALITY_LABEL[filters.modality].toLowerCase()} exercises only.</p> : null}
    </div>
  );
}
