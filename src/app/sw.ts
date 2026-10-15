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
