// /today skeleton: the same grid and cell classes as page.tsx, with fixed-height blocks (sizes per breakpoint in shell.css).
// It carries the page's intro note as real text: that note is the largest text on the page, so it is what the browser reports as the
// Largest Contentful Paint, and it should not wait for the page's database reads (the page replaces it with the identical note).
import { Skel, SkeletonPage } from "@/components/shell/Skeleton";
import { TODAY_INTRO } from "@/components/today/intro";
import { PageIntroPlaceholder } from "@/components/ui/PageIntro";

export default function TodayLoading() {
  return (
    <SkeletonPage label="Today" className="today">
      <header className="today-head">
        <p className="type-label today-label">&nbsp;</p>
        <p className="type-display-xl today-title">Today</p>
      </header>
      <PageIntroPlaceholder id="today">{TODAY_INTRO}</PageIntroPlaceholder>
      <div className="today-grid">
        <div className="today-col today-col--a">
          <div className="today-cell today-cell--start">
            <Skel className="skel--t-start" />
          </div>
          <div className="today-cell today-cell--templates">
            <Skel className="skel--t-templates" />
          </div>
          <div className="today-cell today-cell--body">
            <Skel className="skel--t-body" />
          </div>
        </div>
        <div className="today-col today-col--b">
          <div className="today-cell today-cell--tiles">
            <p className="type-label today-label">&nbsp;</p>
            <Skel className="skel--t-tiles" />
          </div>
          <div className="today-cell today-cell--chart">
            <Skel className="skel--t-chart" />
          </div>
        </div>
        <div className="today-col today-col--c">
          <div className="today-cell today-cell--sets">
            <Skel className="skel--t-sets" />
          </div>
          <div className="today-cell today-cell--insight">
            <Skel className="skel--t-insight" />
          </div>
        </div>
      </div>
    </SkeletonPage>
  );
}
