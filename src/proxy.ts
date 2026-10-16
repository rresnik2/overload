// Next 16 `proxy.ts` (formerly middleware). NOT a security check: it only redirects EARLY when there is no session
// cookie at all. Real authorization is requireUser()/withUser() in src/server/auth/session.ts.
// It deliberately never redirects signed-in-looking users away from /sign-in (a stale cookie would loop).
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  if (process.env.OVERLOAD_SERVER_TIMING === "1") {
    // Measurement only (src/server/perf/server-timing.ts): tell the render which route it is serving and when it started.
    const headers = new Headers(request.headers);
    headers.set("x-overload-path", request.nextUrl.pathname);
    headers.set("x-overload-start", String(Date.now()));
    headers.set("x-overload-id", crypto.randomUUID());
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/today/:path*",
    "/exercises/:path*",
    "/history/:path*",
    "/templates/:path*",
    "/progress/:path*",
    "/insights/:path*",
    "/settings/:path*",
    "/workout/:path*",
    "/onboarding/:path*",
  ],
};
