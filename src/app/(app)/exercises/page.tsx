// Exercise library: tabs by modality, equipment / muscle filters and search, all driven by the URL (works without JS).
import Link from "next/link";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { ExerciseFilters } from "@/components/exercises/ExerciseFilters";
import { FavoriteButton } from "@/components/exercises/FavoriteButton";
import { ExerciseList } from "@/components/exercises/ExerciseList";
import { MODALITY_LABEL, MODALITY_ORDER } from "@/components/exercises/labels";
import { LIBRARY_PAGE_SIZE, libraryHref, parseLibraryParams } from "@/components/exercises/library-url";
import { Pagination } from "@/components/exercises/Pagination";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { requireUser } from "@/server/auth/session";
import { listLastLoads, listRecentExercises } from "@/server/catalog/last-loads";
import { listLibrary } from "@/server/catalog/queries";
import { getProfileRow } from "@/server/profile/profile";
import { loadToday } from "@/server/queries/progress";
import { pageSyncVersion } from "@/server/sync/page-version";

export const metadata = { title: "Exercises" };

const BASE_PATH = "/exercises";
/** How many of the lifter's own exercises lead the first page. */
const RECENT = 8;

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUser();
  const syncVersion = await pageSyncVersion(ctx); // before the first synced row is read (src/server/sync/page-version.ts)
  const filters = parseLibraryParams(await searchParams);
  const result = await listLibrary(ctx, {
    modality: filters.modality,
    equipment: filters.equipment,
    muscle: filters.muscle,
    text: filters.q,
    favoritesOnly: filters.fav,
    page: filters.page,
    pageSize: LIBRARY_PAGE_SIZE,
  });

  // The rows draw the lifter's last load; the first, unfiltered page leads with the exercises they trained most recently.
  const browsing = filters.page <= 1 && !filters.q && !filters.modality && !filters.equipment && !filters.muscle && !filters.fav;
  const [profile, today, loads, recent] = await Promise.all([
    getProfileRow(ctx),
    loadToday(ctx),
    listLastLoads(ctx, { exerciseIds: result.exercises.map((e) => e.id) }),
    browsing ? listRecentExercises(ctx, RECENT) : Promise.resolve(null),
  ]);
  const unit = profile?.unitPreference ?? "KG";
  const favoriteIds = new Set(result.favoriteIds);
  const allCount = MODALITY_ORDER.reduce((sum, m) => sum + result.modalityCounts[m], 0);
  const tabs = [
    { modality: null, label: "All", count: allCount, href: libraryHref(BASE_PATH, filters, { modality: null, equipment: null }), active: filters.modality === null },
    ...MODALITY_ORDER.map((modality) => ({
      modality,
      label: MODALITY_LABEL[modality],
      count: result.modalityCounts[modality],
      href: libraryHref(BASE_PATH, filters, { modality, equipment: null }),
      active: filters.modality === modality,
    })),
  ];

  return (
    <>
      <SyncVersionStamp version={syncVersion} />
      <PageHeader
        title="Exercises"
        meta={["Library", filters.fav ? "Favorites" : filters.modality ? MODALITY_LABEL[filters.modality] : "All"]}
        description="Free weights, machines and cables are kept apart: a machine's numbers are never mixed with a barbell's."
        actions={
          <Link href="/exercises/new" className="btn btn-outline">
            New exercise
          </Link>
        }
      />
      <PageIntro id="exercises">Browse or search every exercise. Tap the star to favorite one, and open an exercise to see how its weight is logged and how you are progressing on it.</PageIntro>
      <ExerciseFilters basePath={BASE_PATH} filters={filters} tabs={tabs} equipmentOptions={result.equipmentOptions} />
      {recent && recent.exercises.length > 0 ? (
        <section aria-labelledby="library-yours">
          <div className="library-section">
            <h2 id="library-yours" className="type-label">
              Yours · last load
            </h2>
          </div>
          <ExerciseList
            exercises={recent.exercises}
            label="Your recent exercises"
            hrefFor={(exercise) => `${BASE_PATH}/${exercise.id}`}
            headingLevel={3}
            favoriteIds={favoriteIds}
            renderAction={(exercise, isFavorite) => <FavoriteButton exerciseId={exercise.id} name={exercise.name} initial={isFavorite} />}
            lastLoads={recent.loads}
            unit={unit}
            today={today}
          />
          <div className="library-section">
            <h2 className="type-label">All exercises · A to Z</h2>
          </div>
        </section>
      ) : null}
      <p className="library-count num" role="status">
        {result.total} {result.total === 1 ? "exercise" : "exercises"}
      </p>
      <ExerciseList
        exercises={result.exercises}
        hrefFor={(exercise) => `${BASE_PATH}/${exercise.id}`}
        headingLevel={recent && recent.exercises.length > 0 ? 3 : 2}
        favoriteIds={favoriteIds}
        renderAction={(exercise, isFavorite) => <FavoriteButton exerciseId={exercise.id} name={exercise.name} initial={isFavorite} />}
        lastLoads={loads}
        unit={unit}
        today={today}
        empty={
          filters.fav && !filters.q && !filters.muscle && !filters.equipment && !filters.modality
            ? {
                title: "No favorites yet",
                description: "Tap the star on an exercise to keep it here and at the top of the picker.",
                action: (
                  <Link href={libraryHref(BASE_PATH, filters, { fav: false })} className="btn btn-neutral">
                    Show all exercises
                  </Link>
                ),
              }
            : {
                title: "No exercises match",
                description: "Nothing fits those filters. Try another search or clear a filter.",
                action: (
                  <Link href={BASE_PATH} className="btn btn-neutral">
                    Show all exercises
                  </Link>
                ),
              }
        }
      />
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(page) => libraryHref(BASE_PATH, filters, { page })} />
    </>
  );
}
