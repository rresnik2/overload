import { Skel, SkeletonHeader, SkeletonPage, SkeletonRows } from "@/components/shell/Skeleton";

export default function ExercisesLoading() {
  return (
    <SkeletonPage label="exercises">
      <SkeletonHeader title="Exercises" meta="Library / All" action />
      <Skel className="skel--filters" />
      <SkeletonRows count={8} />
    </SkeletonPage>
  );
}
