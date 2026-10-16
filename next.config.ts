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
    // see src/client/router-refresh.ts and the Server Actions.
    staleTimes: { dynamic: 30 },
  },
  images: {
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
