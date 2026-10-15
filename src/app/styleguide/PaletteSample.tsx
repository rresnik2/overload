// Static SVG sample of the data-viz palette: four modality lines (distinct markers, direct labels), a dashed forecast with
// the 80% (12%) and 50% (22%) bands, and filled PR stars. Colours come from the --chart-* variables, so it follows the theme.
const W = 640;
const H = 240;
const PAD = { l: 44, r: 96, t: 16, b: 32 };
const x = (i: number) => PAD.l + (i / 14) * (W - PAD.l - PAD.r);
const y = (v: number) => H - PAD.b - ((v - 40) / 80) * (H - PAD.t - PAD.b);

const SERIES = [
  { key: "free-weight", label: "Free weight", color: "var(--chart-free-weight)", marker: "circle", data: [60, 62, 63, 66, 67, 69, 70, 73] },
  { key: "machine", label: "Machine", color: "var(--chart-machine)", marker: "square", data: [80, 80, 82, 83, 85, 85, 88, 90] },
  { key: "cable", label: "Cable", color: "var(--chart-cable)", marker: "triangle", data: [45, 47, 46, 49, 50, 52, 52, 55] },
  { key: "bodyweight", label: "Bodyweight", color: "var(--chart-bodyweight)", marker: "diamond", data: [100, 101, 103, 104, 104, 106, 108, 109] },
] as const;

function Marker({ kind, cx, cy, color }: { kind: string; cx: number; cy: number; color: string }) {
  const r = 4.5;
  const common = { fill: color, stroke: "var(--color-base-100)", strokeWidth: 2 };
  if (kind === "square") return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} {...common} />;
  if (kind === "triangle") return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy + r} ${cx - r - 1},${cy + r}`} {...common} />;
  if (kind === "diamond") return <polygon points={`${cx},${cy - r - 1} ${cx + r + 1},${cy} ${cx},${cy + r + 1} ${cx - r - 1},${cy}`} {...common} />;
  return <circle cx={cx} cy={cy} r={r} {...common} />;
}

function Star({ cx, cy }: { cx: number; cy: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 9 : 4;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill="var(--chart-pr)" stroke="var(--color-base-100)" strokeWidth={1.5} />;
}

export function PaletteSample() {
  const free = SERIES[0].data;
  const last = free.length - 1;
  const fx = (i: number) => x(last + i);
  const band = (spread: number) =>
    `${fx(0)},${y(free[last]!)} ${[1, 2, 3].map((i) => `${fx(i)},${y(free[last]! + i * 1.6 + spread * i)}`).join(" ")} ${[3, 2, 1]
      .map((i) => `${fx(i)},${y(free[last]! + i * 1.6 - spread * i)}`)
      .join(" ")}`;
  const description =
    "Sample chart of four exercise modalities over eight sessions with a dashed forecast and personal records marked with stars. Values are illustrative.";
  return (
    <figure className="sg-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sample chart: modality palette" aria-describedby="sg-chart-desc" className="w-full">
        <desc id="sg-chart-desc">{description}</desc>
        {[40, 60, 80, 100, 120].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--chart-axis)" className="num">
              {v}
            </text>
          </g>
        ))}
        <polygon points={band(1.9)} fill="var(--chart-free-weight)" style={{ opacity: "var(--chart-band-80)" }} />
        <polygon points={band(0.9)} fill="var(--chart-free-weight)" style={{ opacity: "var(--chart-band-50)" }} />
        {SERIES.map((s) => (
          <g key={s.key}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              strokeDasharray={s.key === "machine" ? "6 3" : undefined}
            />
            {s.data.map((v, i) => (
              <Marker key={i} kind={s.marker} cx={x(i)} cy={y(v)} color={s.color} />
            ))}
            <text x={(s.key === "free-weight" ? fx(3) : x(last)) + 12} y={y(s.key === "free-weight" ? s.data[last]! + 4.8 : s.data[last]!) + 4} fontSize={13} fill="var(--color-base-content)">
              {s.label}
            </text>
          </g>
        ))}
        <polyline
          fill="none"
          stroke="var(--chart-forecast)"
          strokeWidth={2}
          strokeDasharray="5 4"
          points={[0, 1, 2, 3].map((i) => `${fx(i)},${y(free[last]! + i * 1.6)}`).join(" ")}
        />
        <Star cx={x(3)} cy={y(free[3]!) - 14} />
        <Star cx={x(7)} cy={y(free[7]!) - 14} />
        <text x={fx(1) - 4} y={y(free[last]! - 6)} fontSize={12} fill="var(--chart-axis)">
          Forecast
        </text>
      </svg>
      <figcaption className="sg-note">
        Free weight = vermilion, machine = graphite (dashed, square markers), cable = slate blue, bodyweight = ochre. Forecast is dashed with the 80% band at 12% and the 50% band at 22% opacity. PRs are filled stars. Identity is never colour alone: marker shape, dash and direct labels back every series.
      </figcaption>
    </figure>
  );
}
