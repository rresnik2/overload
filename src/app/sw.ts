/// <reference lib="esnext" />
/// <reference lib="webworker" />
// Service worker source (stream B). Offline contract:
//  - precache: /~offline and the PWA icons (the app shell routes are cached on first visit; /workout is warmed by the shell,
//    see components/shell/PwaClient.tsx, because it is behind auth and cannot be fetched at install time);
//  - pages: NetworkFirst with a 3 s timeout (gym wifi) falling back to the cache, then to /~offline;
//  - exercise images (free-exercise-db): CacheFirst, opaque responses allowed;
//  - updates NEVER take over mid-workout: skipWaiting is off; the shell posts {type: "SKIP_WAITING"} to the waiting worker
//    only when isWorkoutActive() is false (serwist handles that message when skipWaiting is false).
import { defaultCache } from "@serwist/turbopack/worker";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const EXERCISE_IMAGES = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Direct image URLs and Next's optimizer (`/_next/image?url=<encoded free-exercise-db url>`).
      matcher: ({ url }) =>
        url.href.startsWith(EXERCISE_IMAGES) ||
        (url.pathname === "/_next/image" && decodeURIComponent(url.searchParams.get("url") ?? "").startsWith(EXERCISE_IMAGES)),
      handler: new CacheFirst({
        cacheName: "exercise-images",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }), // 0 = opaque cross-origin responses
          new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90, maxAgeFrom: "last-used" }),
        ],
      }),
    },
    {
      matcher: ({ request, sameOrigin, url }) => request.mode === "navigate" && sameOrigin && !url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

// The shell asks which build this worker is (PwaClient warms the /workout and /today caches once per version, not on every mount).
// The precache manifest changes with every build, so a hash of it is a version.
function manifestVersion(): string {
  const text = JSON.stringify(self.__SW_MANIFEST ?? []);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
const SW_VERSION = manifestVersion();
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "GET_VERSION") event.ports[0]?.postMessage(SW_VERSION);
});
