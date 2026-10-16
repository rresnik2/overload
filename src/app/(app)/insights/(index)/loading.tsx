import { Skel, SkeletonHeader, SkeletonPage } from "@/components/shell/Skeleton";

export default function InsightsLoading() {
  return (
    <SkeletonPage label="insights">
      <SkeletonHeader title="Insights" meta="Weekly review" lines={4} linesWide={3} action />
      <Skel className="skel--narrative" />
      <div className="skel-grid">
        <Skel className="skel--card" />
        <Skel className="skel--card" />
        <Skel className="skel--card" />
      </div>
    </SkeletonPage>
  );
}
