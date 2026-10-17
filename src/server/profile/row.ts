import "server-only";
// The signed-in user's raw profile row, read at most once per server render. The layout's onboarding guard, the page's unit and
// timezone reads, the facts loaders and the insight store all need the same row; React `cache()` shares one query between them
// for the duration of a request. Outside a render (Server Actions, route handlers, scripts) `cache()` just calls through, so
// writers that read back after a write always see fresh data. Keyed by user id, and always `where: { userId }`.
import { cache } from "react";
import type { Profile } from "@/generated/prisma/client";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";

const readProfile = cache((userId: string): Promise<Profile | null> => prisma.profile.findUnique({ where: { userId } }));

/** Raw Prisma row (Decimal fields included; map it with `@/server/mappers` before it leaves src/server). */
export function loadProfileRowCached(ctx: UserCtx): Promise<Profile | null> {
  return readProfile(ctx.id);
}
