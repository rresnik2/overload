// pnpm exec tsx tools/pwa/generate.ts
// Generates every binary asset the PWA needs with the installed `sharp` (outputs are committed):
//   public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png, public/{favicon.ico,apple-touch-icon.png}
//   public/splash/*.png (iOS apple-touch-startup-image, portrait, ink background)
//   public/backdrop/clouds.jpg (grayscale fixed photo backdrop for marketing/auth/onboarding: procedural clouds, no third-party image)
// The mark: three stacked bars that grow wider (progressive overload), vermilion on ink, with the site's hard offset shadow.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const INK = "#141414";
const PAPER = "#F4F2ED";
const VERMILION = "#E4402B";
const root = path.resolve(import.meta.dirname, "../..");
const out = (...p: string[]) => path.join(root, "public", ...p);

/** The bars mark on a 512 grid, centred, with a 14px hard shadow in paper-on-ink contrast. */
function markSvg(size: number, { bleed }: { bleed: boolean }): string {
  // `bleed` icons (maskable, apple-touch) fill the whole square; the mark always sits inside the 80% safe zone.
  const bars = [
    { w: 150, y: 150 },
    { w: 240, y: 224 },
    { w: 330, y: 298 },
  ];
  const x = 91;
  const rects = bars
    .map(
      (b) =>
        `<rect x="${x + 14}" y="${b.y + 14}" width="${b.w}" height="64" fill="${PAPER}" opacity="0.18"/>` +
        `<rect x="${x}" y="${b.y}" width="${b.w}" height="64" fill="${VERMILION}"/>`,
    )
    .join("");
  // The asymmetric frame border from the navbar (thin top, thick right, thickest bottom, medium left).
  const frame = bleed
    ? ""
    : `<g fill="${VERMILION}"><rect x="0" y="0" width="512" height="6"/><rect x="500" y="0" width="12" height="512"/><rect x="0" y="490" width="512" height="22"/><rect x="0" y="0" width="10" height="512"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="${INK}"/>${frame}${rects}</svg>`;
}

async function png(file: string, svg: string, size: number) {
  await sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toFile(file);
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
  await png(out("icons/icon-192.png"), markSvg(512, { bleed: false }), 192);
  await png(out("icons/icon-512.png"), markSvg(512, { bleed: false }), 512);
  await png(out("icons/icon-maskable-512.png"), markSvg(512, { bleed: true }), 512);
  await png(out("icons/apple-touch-icon.png"), markSvg(512, { bleed: true }), 180);
  await png(out("apple-touch-icon.png"), markSvg(512, { bleed: true }), 180);
  const small = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await sharp(Buffer.from(markSvg(512, { bleed: true }))).resize(size, size).png().toBuffer() })),
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
  const mark = await sharp(Buffer.from(markSvg(512, { bleed: false }))).png().toBuffer();
  for (const [w, h, dpr] of SPLASH) {
    const width = w * dpr;
    const height = h * dpr;
    const side = Math.round(width * 0.28);
    const icon = await sharp(mark).resize(side, side).png().toBuffer();
    await sharp({ create: { width, height, channels: 3, background: INK } })
      .composite([{ input: icon, left: Math.round((width - side) / 2), top: Math.round((height - side) / 2) }])
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
await backdrop();
