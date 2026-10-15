import "server-only";
// Profile reads and writes. Every function takes the verified ctx; the row is always `where: { userId: ctx.id }`.
import type { ProfileRow } from "@/contracts/entities";
import { localDateToDate } from "@/lib/dates";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { profileToRow } from "@/server/mappers";
import { failure, fieldErrorsOf, type ActionResult } from "./result";
import { profileFormSchema } from "./schemas";

export async function getProfileRow(ctx: UserCtx): Promise<ProfileRow | null> {
  const row = await prisma.profile.findUnique({ where: { userId: ctx.id } });
  return row ? profileToRow(row) : null;
}

/** Validate with the strict schema (an injected `userId` or any unknown key is rejected) and upsert the session user's row. */
export async function updateProfile(ctx: UserCtx, input: unknown): Promise<ActionResult<ProfileRow>> {
  const parsed = profileFormSchema.safeParse(input);
  if (!parsed.success) return failure("Check the highlighted fields", fieldErrorsOf(parsed.error.issues));
  const { birthDate, ...rest } = parsed.data;
  const data = { ...rest, ...(birthDate === undefined ? {} : { birthDate: birthDate === null ? null : localDateToDate(birthDate) }) };
  const row = await prisma.profile.upsert({
    where: { userId: ctx.id },
    create: { userId: ctx.id, ...data },
    update: data,
  });
  return { ok: true, data: profileToRow(row) };
}
