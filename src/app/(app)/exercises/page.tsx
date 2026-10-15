// Exercise library: tabs by modality, equipment / muscle filters and search, all driven by the URL (works without JS).
import Link from "next/link";
import { ExerciseFilters } from "@/components/exercises/ExerciseFilters";
import { ExerciseList } from "@/components/exercises/ExerciseList";
import { MODALITY_LABEL, MODALITY_ORDER } from "@/components/exercises/labels";
import { LIBRARY_PAGE_SIZE, libraryHref, parseLibraryParams } from "@/components/exercises/library-url";
import { Pagination } from "@/components/exercises/Pagination";
import { PageHeader } from "@/components/primitives/PageHeader";
import { requireUser } from "@/server/auth/session";
import { listLibrary } from "@/server/catalog/queries";

export const metadata = { title: "Exercises" };

const BASE_PATH = "/exercises";

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUser();
  const filters = parseLibraryParams(await searchParams);
  const result = await listLibrary(ctx, {
    modality: filters.modality,
    equipment: filters.equipment,
    muscle: filters.muscle,
    text: filters.q,
    page: filters.page,
    pageSize: LIBRARY_PAGE_SIZE,
  });

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
      <PageHeader
        title="Exercises"
        meta={["Library", filters.modality ? MODALITY_LABEL[filters.modality] : "All"]}
        description="Free weights, machines and cables are kept apart: a machine's numbers are never mixed with a barbell's."
        actions={
          <Link href="/exercises/new" className="btn btn-outline">
            New exercise
          </Link>
        }
      />
      <ExerciseFilters basePath={BASE_PATH} filters={filters} tabs={tabs} equipmentOptions={result.equipmentOptions} />
      <p className="library-count num" role="status">
        {result.total} {result.total === 1 ? "exercise" : "exercises"}
      </p>
      <ExerciseList
        exercises={result.exercises}
        hrefFor={(exercise) => `${BASE_PATH}/${exercise.id}`}
        empty={{
          title: "No exercises match",
          description: "Nothing fits those filters. Try another search or clear a filter.",
          action: (
            <Link href={BASE_PATH} className="btn btn-neutral">
              Show all exercises
            </Link>
          ),
        }}
      />
      <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(page) => libraryHref(BASE_PATH, filters, { page })} />
    </>
  );
}
