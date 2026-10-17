import "server-only";
// The data-access security boundary. FROZEN after Phase 0.
//
//   requireUser()      Server Components, layouts, Server Actions that render: redirects to /sign-in when signed out.
//   withUser(fn)       Server Actions / server functions: resolves the ctx then calls fn(ctx, ...args); throws UnauthorizedError.
//   withUserRoute(fn)  Route handlers: responds 401 JSON when signed out.
//
// `proxy.ts` only redirects early on cookie presence; THIS is the check. A UserCtx never comes from a request body.
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { mintUserCtx, type UserCtx } from "./ctx";

export type { UserCtx } from "./ctx";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
}

export interface SessionInfo {
  ctx: UserCtx;
  user: SessionUser;
}

async function lookupSession(requestHeaders: Headers): Promise<SessionInfo | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  return {
    ctx: mintUserCtx(session.user.id),
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
      image: session.user.image ?? null,
    },
  };
}

// One lookup per server render: the (app) layout, the page and the guards all call getSessionInfo() with the ambient request
// headers, and React `cache()` shares the result between them. Route handlers pass their own `request.headers` and are not cached.
const ambientSession = cache(async () => lookupSession(await headers()));

/** The current session (ctx + user) or null. Never redirects. */
export async function getSessionInfo(requestHeaders?: Headers): Promise<SessionInfo | null> {
  return requestHeaders ? lookupSession(requestHeaders) : ambientSession();
}

/** ctx or null. Never redirects. */
export async function getUserCtx(requestHeaders?: Headers): Promise<UserCtx | null> {
  return (await getSessionInfo(requestHeaders))?.ctx ?? null;
}

/** For pages/layouts/actions: signed-out users are redirected to /sign-in. */
export async function requireUser(): Promise<UserCtx> {
  const info = await getSessionInfo();
  if (!info) redirect("/sign-in");
  return info.ctx;
}

/** Like requireUser() but also returns the user's name/email/image (for the shell, avatar, settings). */
export async function requireSessionInfo(): Promise<SessionInfo> {
  const info = await getSessionInfo();
  if (!info) redirect("/sign-in");
  return info;
}

/** Wrap a server function so it always receives a verified ctx as its first argument. Throws UnauthorizedError when signed out. */
export function withUser<A extends unknown[], R>(fn: (ctx: UserCtx, ...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const ctx = await getUserCtx();
    if (!ctx) throw new UnauthorizedError();
    return fn(ctx, ...args);
  };
}

/** Wrap a route handler. Signed-out requests get `401 {"error":"unauthorized"}`; the handler never runs. */
export function withUserRoute<RouteCtx = unknown>(
  handler: (ctx: UserCtx, request: Request, routeCtx: RouteCtx) => Promise<Response>,
): (request: Request, routeCtx: RouteCtx) => Promise<Response> {
  return async (request, routeCtx) => {
    const ctx = await getUserCtx(request.headers);
    if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
    return handler(ctx, request, routeCtx);
  };
}
