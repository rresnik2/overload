// FROZEN after Phase 0 (change-request protocol applies).
import createMDX from "@next/mdx";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .mdx lets /learn articles (stream G) be written as prose; plain .tsx pages keep working.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  poweredByHeader: false,
  reactStrictMode: true,
  // cacheComponents stays OFF for v1 (see docs/PLAN.md).
  experimental: {
    // Client router cache for dynamic pages: a tab revisited within 30 s is served from memory instead of re-rendering on the
    // server. Anything that changes server data must refresh the router afterwards (router.refresh() / revalidatePath()),
    // see src/client/sync/server-refresh.ts (after a sync) and the Server Actions.
    // `static` also bounds router.prefetch() (the tab prefetch in components/shell/useTabPrefetch.ts), whose default is 5 minutes.
    staleTimes: { dynamic: 30, static: 30 },
  },
  images: {
    // Only the exercise photos use the optimizer (4:3, never wider than a phone column or a desktop card), so keep the candidate
    // widths few and small: a 3x phone asks for 828 px at most instead of 1200+, and the optimizer never enlarges an original.
    deviceSizes: [384, 640, 828],
    imageSizes: [96, 192],
    remotePatterns: [
      // Catalog exercise images (free-exercise-db, Unlicense). See src/lib/catalog-images.ts.
      { protocol: "https", hostname: "raw.githubusercontent.com", pathname: "/yuhonas/free-exercise-db/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

const withMDX = createMDX({});

export default withSerwist(withMDX(nextConfig));
