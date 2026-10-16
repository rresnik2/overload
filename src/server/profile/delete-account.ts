import "server-only";
// Account deletion: typed confirmation + proof the person at the keyboard owns the account (their password, or a very
// recent sign-in for password-less accounts), then `user.delete` which cascades the whole domain graph.
import { headers } from "next/headers";
import { auth } from "@/server/auth/auth";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { failure, fieldErrorsOf, type ActionResult } from "./result";
import { deleteAccountSchema } from "./schemas";

/** Password-less accounts (Google / passkey only) must have signed in within this window. */
export const RECENT_SIGN_IN_MS = 10 * 60 * 1000;

/** Pure decision: can this session delete the account without a password? */
export function isRecentSession(sessionCreatedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MS;
}

export async function deleteAccount(ctx: UserCtx, input: unknown): Promise<ActionResult> {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return failure("Check the highlighted fields", fieldErrorsOf(parsed.error.issues));

  const requestHeaders = await headers();
  const credential = await prisma.account.findFirst({ where: { userId: ctx.id, providerId: "credential" }, select: { id: true } });
  if (credential) {
    if (!parsed.data.password) return failure("Enter your password to confirm", { password: "Enter your password" });
    try {
      await auth.api.verifyPassword({ body: { password: parsed.data.password }, headers: requestHeaders });
    } catch {
      return failure("That password is not correct", { password: "That password is not correct" });
    }
  } else {
    const session = await auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } }); // destructive: always read the database
    if (!session || session.user.id !== ctx.id || !isRecentSession(new Date(session.session.createdAt))) {
      return failure("For your security, sign out and sign back in, then try again.");
    }
  }

  await prisma.user.delete({ where: { id: ctx.id } }); // cascades every user-owned row
  try {
    await auth.api.signOut({ headers: requestHeaders }); // clears the cookies (nextCookies); the session row is already gone
  } catch {
    // session already deleted by the cascade; the cookie is cleared by the caller
  }
  return { ok: true };
}
