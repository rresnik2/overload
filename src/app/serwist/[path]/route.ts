// Serves the service worker (/serwist/sw.js) built from src/app/sw.ts. Stream B owns this folder.
// @serwist/turbopack workaround for Turbopack (no plugin API): a force-static route handler that bundles the worker
// with esbuild at build time and injects the precache manifest. Responses carry `Service-Worker-Allowed: /`.
import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// Revision for extra precache entries: the commit on Vercel, else the local git HEAD, else "dev".
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ?? (spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || "dev");

// Everything here must be a public, unauthenticated 200: one failing entry aborts the worker install.
const PRECACHE = ["/~offline", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/favicon.ico"];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: PRECACHE.map((url) => ({ url, revision })),
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
