import { Skel, SkeletonPage } from "./Skeleton";

/** Placeholder for a detail page whose title is not known yet (an exercise, one progress series, a weekly review). */
export function DetailSkeleton({ label }: { label: string }) {
  return (
    <SkeletonPage label={label}>
      <Skel className="skel--title" />
      <Skel className="skel--chart" />
      <div className="skel-grid">
        <Skel className="skel--card" />
        <Skel className="skel--card" />
      </div>
    </SkeletonPage>
  );
}
