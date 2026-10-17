// One exercise: e1RM with forecast, top set and volume. A machine-series picker keeps each machine profile as its own chart.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SyncVersionStamp } from "@/client/sync/SyncVersionStamp";
import { MODALITY_LABEL } from "@/components/exercises/labels";
import { EmptyState } from "@/components/primitives/EmptyState";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PageIntro } from "@/components/ui/PageIntro";
import { Term } from "@/components/ui/Term";
import { ExerciseCharts } from "@/components/progress/ExerciseCharts";
import { SeriesPicker } from "@/components/progress/SeriesPicker";
import { isUuid } from "@/lib/ids";
import { requireUser } from "@/server/auth/session";
import { loadExerciseProgress, loadToday } from "@/server/queries/progress";
import { pageSyncVersion } from "@/server/sync/page-version";

type Props = { params: Promise<{ exerciseId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

// Shared by generateMetadata and the page so a request loads the exercise once. The sync version is read beside the profile, before
// any synced row is (src/server/sync/page-version.ts).
const load = cache(async (exerciseId: string, seriesKey: string | null) => {
  const ctx = await requireUser();
  const [today, syncVersion] = await Promise.all([loadToday(ctx), pageSyncVersion(ctx)]);
  const data = await loadExerciseProgress(ctx, exerciseId, { seriesKey, today });
  return data ? { ...data, syncVersion } : null;
});

const seriesParam = (v: string | string[] | undefined): string | null => (typeof v === "string" && v ? v : null);

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { exerciseId } = await params;
  if (!isUuid(exerciseId)) return { title: "Progress" };
  const data = await load(exerciseId, seriesParam((await searchParams).series));
  return { title: data ? `${data.name} progress` : "Progress" };
}

export default async function ExerciseProgressPage({ params, searchParams }: Props) {
  const { exerciseId } = await params;
  if (!isUuid(exerciseId)) notFound();
  const data = await load(exerciseId, seriesParam((await searchParams).series));
  if (!data) notFound();
  const selected = data.selected;

  return (
    <>
      <SyncVersionStamp version={data.syncVersion} />
      <PageHeader
        title={data.name}
        meta={["Progress", MODALITY_LABEL[data.modality]]}
        actions={
          <>
            <Link href="/progress" className="btn btn-outline">All progress</Link>
            <Link href={`/exercises/${data.exerciseId}`} className="btn btn-outline">Exercise</Link>
          </>
        }
      />
      {selected ? (
        <>
          <PageIntro id="progress-exercise">
            The first chart follows your <Term id="e1rm">estimated max</Term> and, once you have enough sessions, a <Term id="forecast">forecast</Term>. Below it are your top set and your volume.
          </PageIntro>
          <SeriesPicker exerciseId={data.exerciseId} series={data.series} selectedKey={selected.ref.seriesKey} />
          {data.modality === "MACHINE" || data.modality === "CABLE" ? (
            <p className="progress-note">Machine and cable numbers stay in their own series: they are never merged with free weights or converted to a barbell equivalent.</p>
          ) : null}
          <ExerciseCharts exerciseName={data.name} series={selected} unit={data.unit} />
        </>
      ) : (
        <EmptyState
          title="You have not logged this exercise yet"
          description="Once you log it in a workout, its estimated 1RM, top set and volume are charted here."
          action={<Link href="/workout" className="ui-btn ui-btn--primary">Start a workout</Link>}
        />
      )}
    </>
  );
}
