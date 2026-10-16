import { SkeletonHeader, SkeletonPage, SkeletonRows } from "@/components/shell/Skeleton";

export default function TemplatesLoading() {
  return (
    <SkeletonPage label="templates">
      <SkeletonHeader title="Templates" meta="Workouts / Plan" />
      <SkeletonRows count={4} />
    </SkeletonPage>
  );
}
