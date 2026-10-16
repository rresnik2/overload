import { Skel, SkeletonHeader, SkeletonPage } from "@/components/shell/Skeleton";

export default function ProgressLoading() {
  return (
    <SkeletonPage label="progress">
      <SkeletonHeader title="Progress" meta="Last 16 weeks" lines={3} linesWide={2} action />
      <div className="skel-grid">
        <Skel className="skel--card" />
        <Skel className="skel--card" />
        <Skel className="skel--card" />
        <Skel className="skel--card" />
      </div>
      <Skel className="skel--chart" />
    </SkeletonPage>
  );
}
