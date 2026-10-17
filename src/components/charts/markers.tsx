"use client";
// SVG marks shared by the charts: shaped markers (a second channel next to colour), the PR star and the deload (hollow) marker.
import type { MarkerShape } from "./format";

export const SURFACE = "var(--color-base-200)";

/** Five-point star centred on (cx, cy) with outer radius r. */
export function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

export interface MarkProps {
  cx: number;
  cy: number;
  color: string;
  shape: MarkerShape;
  /** Hollow marker (deload session). */
  hollow?: boolean;
  /** Radius (default 4: an 8px marker). */
  r?: number;
}

/** A >= 8px marker with a 2px surface ring so it stays legible over lines and neighbours. */
export function Mark({ cx, cy, color, shape, hollow = false, r = 4.5 }: MarkProps) {
  const fill = hollow ? SURFACE : color;
  const common = { fill, stroke: hollow ? color : SURFACE, strokeWidth: hollow ? 2 : 2, paintOrder: "stroke" as const };
  switch (shape) {
    case "square":
      return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
    case "diamond":
      return <polygon points={`${cx},${cy - r * 1.3} ${cx + r * 1.3},${cy} ${cx},${cy + r * 1.3} ${cx - r * 1.3},${cy}`} {...common} />;
    case "triangle":
      return <polygon points={`${cx},${cy - r * 1.2} ${cx + r * 1.2},${cy + r} ${cx - r * 1.2},${cy + r}`} {...common} />;
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />;
  }
}

/** Filled plate-red star: a personal record. */
export function PrStar({ cx, cy, r = 8 }: { cx: number; cy: number; r?: number }) {
  return <polygon points={starPoints(cx, cy, r)} fill="var(--chart-pr)" stroke={SURFACE} strokeWidth={2} paintOrder="stroke" strokeLinejoin="round" />;
}
