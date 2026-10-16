"use client";
// The recharts-based charts, loaded after the page is interactive. recharts is the largest dependency of the client bundle (about
// 400 KB of the 1.2 MB the progress detail page used to ship), and a chart is drawn client-side anyway (ResponsiveContainer measures
// the browser), so nothing is lost by fetching it afterwards. The placeholder has the plot's exact size, so nothing moves when the
// chart arrives. The charts render inside <ChartFrame>, which already carries the summary and the data table for screen readers.
import dynamic from "next/dynamic";

const Placeholder = ({ tall }: { tall?: boolean }) => (
  <div className={tall ? "chart-plot chart-plot--tall" : "chart-plot"} aria-hidden="true">
    <div className="chart-frame__skeleton" />
  </div>
);
const TallPlaceholder = () => <Placeholder tall />;
const PlotPlaceholder = () => <Placeholder />;

export const E1rmForecastChart = dynamic(() => import("./E1rmForecastChart").then((m) => m.E1rmForecastChart), { ssr: false, loading: TallPlaceholder });
export const TopSetChart = dynamic(() => import("./TopSetChart").then((m) => m.TopSetChart), { ssr: false, loading: PlotPlaceholder });
export const VolumeChart = dynamic(() => import("./VolumeChart").then((m) => m.VolumeChart), { ssr: false, loading: PlotPlaceholder });
export const WeightTrendChart = dynamic(() => import("./BodyTrendChart").then((m) => m.WeightTrendChart), { ssr: false, loading: TallPlaceholder });
export const BodyFatChart = dynamic(() => import("./BodyTrendChart").then((m) => m.BodyFatChart), { ssr: false, loading: PlotPlaceholder });
