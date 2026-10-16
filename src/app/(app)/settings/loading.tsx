// Inside the settings layout, so the title and sub-navigation stay on screen; only the form area is a placeholder.
import { Skel, SkeletonPage } from "@/components/shell/Skeleton";

export default function SettingsLoading() {
  return (
    <SkeletonPage label="settings">
      <div className="skel-rows">
        <Skel className="skel--form" />
        <Skel className="skel--form" />
        <Skel className="skel--form" />
      </div>
    </SkeletonPage>
  );
}
