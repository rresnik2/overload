// Catalog exercise images (free-exercise-db, Unlicense), hosted on GitHub raw. PURE. FROZEN after Phase 0.
// `next.config.ts` allows this host in images.remotePatterns; the service worker caches them CacheFirst (stream B).
export const CATALOG_IMAGE_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

/** "3_4_Sit-Up/0.jpg" -> full URL. Already-absolute URLs (custom exercises) pass through. */
export function catalogImageUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${CATALOG_IMAGE_BASE}${path.replace(/^\/+/, "")}`;
}
