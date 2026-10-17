// Dev and measurement only: the recent per-request timing entries recorded when OVERLOAD_SERVER_TIMING=1 (404 otherwise).
// Entries hold a path, a query count and durations; nothing about the user.
//   GET    /api/perf/server-timing              all recent entries
//   GET    /api/perf/server-timing?path=/today  the latest entry for that path, also as a Server-Timing header
//   DELETE /api/perf/server-timing              forget them
import { NextResponse, type NextRequest } from "next/server";
import { recentTimings, resetTimings, serverTimingEnabled, serverTimingHeader } from "@/server/perf/server-timing";

export const dynamic = "force-dynamic";

const off = () => new NextResponse(null, { status: 404 });

export function GET(request: NextRequest) {
  if (!serverTimingEnabled()) return off();
  const path = request.nextUrl.searchParams.get("path");
  const kind = request.nextUrl.searchParams.get("kind");
  const all = recentTimings().filter((e) => (!path || e.path === path) && (!kind || e.kind === kind));
  if (!path) return NextResponse.json(all);
  const latest = all.at(-1);
  if (!latest) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(latest, { headers: { "Server-Timing": serverTimingHeader(latest) } });
}

export function DELETE() {
  if (!serverTimingEnabled()) return off();
  resetTimings();
  return new NextResponse(null, { status: 204 });
}
