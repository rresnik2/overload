// The branded per-request user context. FROZEN after Phase 0.
//
// A `UserCtx` can only be produced by requireUser()/withUser()/withUserRoute() (src/server/auth/session.ts), which read
// the verified session. Every query, Server Action and sync function takes `ctx: UserCtx` and filters with
// `where: { userId: ctx.id }`. Because the brand is a unique symbol, a plain `{ id }` object (or an id taken from a
// request body) does not type-check as a UserCtx.
//
// `mintUserCtx` is the only constructor. Use it ONLY in: session.ts, the weekly cron (acting per user), and tests.
declare const userCtxBrand: unique symbol;

export type UserCtx = Readonly<{ id: string }> & { readonly [userCtxBrand]: "UserCtx" };

export function mintUserCtx(id: string): UserCtx {
  if (!id) throw new Error("mintUserCtx: empty user id");
  return Object.freeze({ id }) as UserCtx;
}
