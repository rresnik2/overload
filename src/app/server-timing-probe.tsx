// Server component, rendered by the root layout only when OVERLOAD_SERVER_TIMING=1 (see src/server/perf/server-timing.ts).
// Records one timing entry per page or RSC request once the response has finished.
import { headers } from "next/headers";
import { after } from "next/server";
import { finishRequest, requestStats } from "@/server/perf/server-timing";

export async function ServerTimingProbe() {
  const h = await headers();
  // Set by proxy.ts when the flag is on; only the routes the proxy matches (the signed-in app) carry it.
  const path = h.get("x-overload-path");
  if (!path) return null;
  const startedAt = Number(h.get("x-overload-start")) || Date.now();
  const kind = h.get("rsc") ? "rsc" : "html";
  const stats = requestStats();
  after(() => {
    finishRequest(path, kind, startedAt, stats);
  });
  return null;
}
