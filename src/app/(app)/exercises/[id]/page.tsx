// Exercise detail: photos, how the logged weight is read, muscles, instructions and the user's progression series.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ExerciseDetail } from "@/components/exercises/ExerciseDetail";
import { FavoriteButton } from "@/components/exercises/FavoriteButton";
import { exerciseMetaParts } from "@/components/exercises/labels";
import { PageHeader } from "@/components/primitives/PageHeader";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/server/auth/session";
import { getExerciseDetail, listFavoriteExerciseIds } from "@/server/catalog/queries";

type Props = { params: Promise<{ id: string }> };

// Shared by generateMetadata and the page so a request loads the exercise once.
const loadDetail = cache(async (id: string) => {
  const ctx = await requireUser();
  const detail = await getExerciseDetail(ctx, id);
  return detail ? { ...detail, isFavorite: (await listFavoriteExerciseIds(ctx)).has(id) } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Exercise" };
  const detail = await loadDetail(id);
  return { title: detail?.exercise.name ?? "Exercise" };
}

export default async function ExerciseDetailPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const detail = await loadDetail(id);
  if (!detail) notFound();
  const { exercise, series, isFavorite } = detail;

  return (
    <>
      <PageHeader
        title={exercise.name}
        meta={exerciseMetaParts(exercise)}
        actions={
          <>
            <FavoriteButton exerciseId={exercise.id} name={exercise.name} initial={isFavorite} />
            <Link href="/exercises" className="btn btn-outline">
              All exercises
            </Link>
          </>
        }
      />
      <ExerciseDetail exercise={exercise} series={series} />
    </>
  );
}
