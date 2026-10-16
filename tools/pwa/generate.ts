// pnpm exec tsx tools/pwa/generate.ts
// Generates every binary asset the PWA needs with the installed `sharp` (outputs are committed):
//   public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png, public/{favicon.ico,apple-touch-icon.png}
//   public/splash/*.png (iOS apple-touch-startup-image, portrait, floor background)
//   public/backdrop/clouds.jpg (grayscale fixed photo backdrop for marketing/auth/onboarding: procedural clouds, no third-party image);
//     only with `--backdrop`, since the icons and splash change far more often than the backdrop
// The mark: a calibrated plate seen face-on, drawn like the Dial's face (docs/design/calibrated-dial-handoff.html):
// plate-blue rim with tick marks and an index notch, a steel hub and a dark centre hole, on the rubber floor.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { THEME_COLORS } from "../../src/lib/theme";

// Tokens from src/styles/theme.css, restated because a script cannot read CSS custom properties.
const FLOOR = THEME_COLORS.ink; // --color-base-100 of overload-floor
const PLATE_BLUE = "#2F63D6"; // --plate-blue
const STEEL_LIGHT = "#D4D8DB"; // the hub gradient runs from here to --steel-dark, averaging --steel (#B5BABF)
const STEEL_DARK = "#8C9196"; // --steel-dark
const HOLE = "#121314"; // the Dial's centre hole
const root = path.resolve(import.meta.dirname, "../..");
const out = (...p: string[]) => path.join(root, "public", ...p);

/** The tick geometry of `Dial` (30 ticks, a major one every fifth), on its -112..112 grid. */
function ticks(): string {
  const n = 30;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = ((i * 360) / n - 90) * (Math.PI / 180);
    const r1 = i % 5 === 0 ? 78 : 84;
    const r2 = 93;
    d += `M${(Math.cos(a) * r1).toFixed(2)} ${(Math.sin(a) * r1).toFixed(2)}L${(Math.cos(a) * r2).toFixed(2)} ${(Math.sin(a) * r2).toFixed(2)}`;
  }
  return `<path d="${d}" stroke="#FFFFFF" stroke-opacity="0.75" stroke-width="2.4" fill="none"/>`;
}

/**
 * The plate face-on, centred at the origin of a 224-unit grid (rim radius 100). `detail: false` is the favicon
 * version: no ticks or inner recess, a bigger hub, so it still reads at 16px.
 */
function plateGroup({ detail }: { detail: boolean }): string {
  const hub = detail ? 32 : 42;
  const hole = detail ? 12 : 17;
  return (
    `<circle r="100" fill="${PLATE_BLUE}"/>` +
    `<circle r="100" fill="url(#shade)"/>` +
    (detail
      ? ticks() +
        `<circle r="70" fill="#000" opacity="0.16"/>` +
        `<circle r="70" fill="none" stroke="#000" stroke-opacity="0.25" stroke-width="2"/>` +
        `<rect x="-3.5" y="-68" width="7" height="16" rx="3.5" fill="#FFFFFF" opacity="0.75"/>`
      : "") +
    `<circle r="${hub}" fill="url(#hub)"/>` +
    `<circle r="${hole}" fill="${HOLE}"/>`
  );
}

const DEFS =
  `<defs><radialGradient id="shade" cx="40%" cy="32%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.3"/></radialGradient>` +
  `<radialGradient id="hub" cx="38%" cy="34%" r="75%"><stop offset="0" stop-color="${STEEL_LIGHT}"/><stop offset="1" stop-color="${STEEL_DARK}"/></radialGradient></defs>`;

/**
 * The plate on a floor square (512 grid). Every icon uses the same plate (rim radius 190 = 74% of the width), so the
 * maskable one stays inside the 80% safe zone (a circle of radius 205 around the centre) and the others match it.
 * The OS rounds the corners of the "any" and apple-touch icons, so none of them draws its own frame.
 */
function markSvg(size: number, { detail = true }: { detail?: boolean } = {}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${DEFS}<rect width="512" height="512" fill="${FLOOR}"/><g transform="translate(256 256) scale(1.9)">${plateGroup({ detail })}</g></svg>`;
}

/** The plate alone on a transparent square of the given pixel size (for the splash screens). */
function plateSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-100 -100 200 200">${DEFS}${plateGroup({ detail: true })}</svg>`;
}

/** Rendered from the vector at the target size, so ticks and edges stay crisp (never downscaled from a bigger raster). */
async function png(file: string, size: number) {
  await sharp(Buffer.from(markSvg(size))).png({ compressionLevel: 9 }).toFile(file);
  console.log("wrote", path.relative(root, file));
}

/** An ICO is a header plus PNG payloads; modern browsers accept PNG entries. */
function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach((p, i) => {
    const o = 6 + i * 16;
    header.writeUInt8(p.size >= 256 ? 0 : p.size, o);
    header.writeUInt8(p.size >= 256 ? 0 : p.size, o + 1);
    header.writeUInt16LE(1, o + 4);
    header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(p.data.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += p.data.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.data)]);
}

async function icons() {
  await png(out("icons/icon-192.png"), 192);
  await png(out("icons/icon-512.png"), 512);
  await png(out("icons/icon-maskable-512.png"), 512);
  await png(out("icons/apple-touch-icon.png"), 180);
  await png(out("apple-touch-icon.png"), 180);
  const small = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await sharp(Buffer.from(markSvg(size, { detail: false }))).png().toBuffer() })),
  );
  fs.writeFileSync(out("favicon.ico"), ico(small));
  console.log("wrote public/favicon.ico");
}

// Portrait iPhone sizes: [css width, css height, device pixel ratio]
const SPLASH: [number, number, number][] = [
  [440, 956, 3], // 16 Pro Max
  [402, 874, 3], // 16 Pro
  [430, 932, 3], // 15/14 Pro Max, 16 Plus
  [393, 852, 3], // 15/15 Pro/14 Pro, 16
  [428, 926, 3], // 13/12 Pro Max, 14 Plus
  [390, 844, 3], // 13/12/14
  [414, 896, 3], // XS Max / 11 Pro Max
  [414, 896, 2], // XR / 11
  [375, 812, 3], // X / XS / 11 Pro / 13 mini
  [414, 736, 3], // 6+/7+/8+
  [375, 667, 2], // SE / 8
];

async function splash() {
  for (const [w, h, dpr] of SPLASH) {
    const width = w * dpr;
    const height = h * dpr;
    const side = Math.round(width * 0.38); // the plate's diameter; the splash sits on the floor with nothing else
    const plate = await sharp(Buffer.from(plateSvg(side))).png().toBuffer();
    await sharp({ create: { width, height, channels: 3, background: FLOOR } })
      .composite([{ input: plate, left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(out(`splash/${width}x${height}.png`));
    console.log("wrote", `public/splash/${width}x${height}.png`);
  }
}

async function backdrop() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000">
    <filter id="c" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.0042" numOctaves="5" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.55" result="a"/>
      <feFlood flood-color="#fff" result="w"/><feComposite in="w" in2="a" operator="in" result="cloud"/>
    </filter>
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>
    <rect width="1600" height="1000" fill="url(#g)"/>
    <rect width="1600" height="1000" filter="url(#c)"/>
  </svg>`;
  await sharp(Buffer.from(svg)).grayscale().blur(2.5).jpeg({ quality: 62, mozjpeg: true }).toFile(out("backdrop/clouds.jpg"));
  console.log("wrote public/backdrop/clouds.jpg");
}

await icons();
await splash();
if (process.argv.includes("--backdrop")) await backdrop();
