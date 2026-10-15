import "server-only";
// Final onboarding step: Profile upsert (sets onboardedAt) + the first BodyMetric, in ONE transaction.
// The BodyMetric is a synced model written outside /api/sync, so it carries sync metadata (CONTRACTS.md 12a).
import { bodyMetricFieldsSchema } from "@/contracts/entities";
import { localDateToDate, toLocalDate } from "@/lib/dates";
import { newId } from "@/lib/ids";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { bumpSyncVersion, syncMixin } from "@/server/sync-meta";
import { failure, fieldErrorsOf, type ActionResult } from "./result";
import { onboardingSchema } from "./schemas";

export async function completeOnboarding(ctx: UserCtx, input: unknown, now: Date = new Date()): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return failure("Check the highlighted fields", fieldErrorsOf(parsed.error.issues));
  const { weightKg, bodyFatPct, birthDate, ...profile } = parsed.data;

  const metric = bodyMetricFieldsSchema.parse({
    measuredAt: now.toISOString(),
    localDate: toLocalDate(now, profile.timezone),
    weightKg,
    bodyFatPct,
  });

  await prisma.$transaction(async (tx) => {
    const existing = await tx.profile.findUnique({ where: { userId: ctx.id }, select: { onboardedAt: true } });
    if (existing?.onboardedAt) return; // double submit / second tab: already done
    const data = { ...profile, birthDate: localDateToDate(birthDate), onboardedAt: now };
    await tx.profile.upsert({ where: { userId: ctx.id }, create: { userId: ctx.id, ...data }, update: data });
    const version = await bumpSyncVersion(tx, ctx);
    const { localDate, ...metricFields } = metric;
    await tx.bodyMetric.create({
      data: {
        id: newId(),
        userId: ctx.id,
        ...metricFields,
        measuredAt: new Date(metric.measuredAt),
        localDate: localDateToDate(localDate),
        ...syncMixin(version, Object.keys(metric), now.getTime()),
      },
    });
  });
  return { ok: true };
}
