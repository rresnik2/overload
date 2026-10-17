import { SkeletonHeader, SkeletonPage, SkeletonRows } from "@/components/shell/Skeleton";

export default function HistoryLoading() {
  return (
    <SkeletonPage label="history">
      <SkeletonHeader title="History" meta="Workouts / Log" />
      <SkeletonRows count={6} />
    </SkeletonPage>
  );
}
