import "server-only";
// Body-metric writes for the online body form (stream F). The Server Actions in ./body.ts wrap these in withUser().
//
// Writes go through applyServerMutations (the same path as /api/sync): one SyncState-locked transaction that merges per
// field by HLC, bumps the per-user version so other devices pull the row, and re-derives bodyweight-dependent sets.
// The schema is the strict contract one (no userId, version, hlc, ...); the user is always `ctx`, never an argument.
import { z } from "zod";
import { bodyMetricFieldsSchema } from "@/contracts/entities";
import { syncRequestSchema } from "@/contracts/sync";
import { toLocalDate, zonedTimeToUtc } from "@/lib/dates";
import { navyBodyFat } from "@/lib/analytics/scores";
import { isUuid, newId } from "@/lib/ids";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { localDate as dateOnly, num } from "@/server/mappers";
import { serverHlc } from "@/server/sync-meta";
import { applyServerMutations } from "@/server/sync/apply";
import { failure, fieldErrorsOf, type ActionResult } from "@/server/profile/result";

/** What the form may send: the writable fields except `measuredAt` (the server stamps it). Strict: unknown keys are rejected. */
export const bodyMetricInputSchema = bodyMetricFieldsSchema.omit({ measuredAt: true });
export type BodyMetricInput = z.input<typeof bodyMetricInputSchema>;

const MEASURE_KEYS = ["weightKg", "bodyFatPct", "neckCm", "waistCm", "hipCm", "chestCm", "armCm", "thighCm", "calfCm"] as const;

type Fields = z.output<typeof bodyMetricInputSchema>;

/** Cross-field rules. Navy results are recomputed here so a client can never submit a body-fat % it did not measure. */
async function reconcile(ctx: UserCtx, fields: Fields): Promise<{ ok: true; fields: Fields } | { ok: false; fieldErrors: Record<string, string> }> {
  const errors: Record<string, string> = {};
  const { bodyFatMethod } = fields;
  let { bodyFatPct } = fields;

  if (bodyFatMethod === "NAVY_TAPE") {
    const profile = await prisma.profile.findUnique({ where: { userId: ctx.id }, select: { sex: true, heightCm: true } });
    const sex = profile?.sex === "MALE" || profile?.sex === "FEMALE" ? profile.sex : null;
    if (!sex || profile?.heightCm == null) {
      errors.bodyFatMethod = "The tape method needs your sex and height (set them in your profile)";
    } else if (fields.neckCm == null || fields.waistCm == null || (sex === "FEMALE" && fields.hipCm == null)) {
      errors.bodyFatMethod = sex === "FEMALE" ? "Enter neck, waist and hip for the tape method" : "Enter neck and waist for the tape method";
    } else {
      const pct = navyBodyFat({ sex, heightCm: num(profile.heightCm) as number, neckCm: fields.neckCm, waistCm: fields.waistCm, hipCm: fields.hipCm });
      if (pct == null) errors.waistCm = "These measurements do not give a valid body-fat estimate";
      else bodyFatPct = pct;
    }
  } else if (bodyFatPct != null && bodyFatMethod == null) {
    errors.bodyFatMethod = "Say how the body-fat % was measured";
  } else if (bodyFatPct == null && bodyFatMethod != null) {
    errors.bodyFatPct = "Enter the body-fat %";
  }

  if (MEASURE_KEYS.every((k) => (k === "bodyFatPct" ? bodyFatPct : fields[k]) == null)) {
    errors._ = "Enter at least one measurement";
  }
  return Object.keys(errors).length ? { ok: false, fieldErrors: errors } : { ok: true, fields: { ...fields, bodyFatPct, bodyFatMethod } };
}

/** measuredAt for a localDate: now when it is the user's today, else noon in their timezone on that date. */
function measuredAtFor(localDate: string, timezone: string, now: Date): string {
  return localDate === toLocalDate(now, timezone) ? now.toISOString() : zonedTimeToUtc(localDate, 12, 0, timezone).toISOString();
}

async function userTimezone(ctx: UserCtx): Promise<string> {
  const profile = await prisma.profile.findUnique({ where: { userId: ctx.id }, select: { timezone: true } });
  return profile?.timezone ?? "UTC";
}

async function push(ctx: UserCtx, id: string, fields: Record<string, unknown>, now: Date): Promise<ActionResult<{ id: string }>> {
  const hlc = serverHlc(now.getTime());
  const state = await prisma.syncState.findUnique({ where: { userId: ctx.id }, select: { version: true } });
  const request = syncRequestSchema.parse({
    deviceId: "server",
    // the response (rows with version > cursor) is discarded: start from the current version so the page stays tiny
    cursor: state?.version ?? 0,
    clientHlc: hlc,
    mutations: [{ mutationId: newId(), entity: "bodyMetric", id, fields, fieldHlc: Object.fromEntries(Object.keys(fields).map((k) => [k, hlc])) }],
  });
  const response = await applyServerMutations(ctx, request);
  const result = response.results[0];
  if (!result || result.status === "rejected") return failure(result?.message ?? "Could not save this measurement");
  return { ok: true, data: { id } };
}

/** Add a measurement. */
export async function addBodyMetric(ctx: UserCtx, input: unknown, now: Date = new Date()): Promise<ActionResult<{ id: string }>> {
  const parsed = bodyMetricInputSchema.safeParse(input);
  if (!parsed.success) return failure("Check the highlighted fields", fieldErrorsOf(parsed.error.issues));
  const reconciled = await reconcile(ctx, parsed.data);
  if (!reconciled.ok) return failure("Check the highlighted fields", reconciled.fieldErrors);
  const measuredAt = measuredAtFor(reconciled.fields.localDate, await userTimezone(ctx), now);
  const full = bodyMetricFieldsSchema.parse({ ...reconciled.fields, measuredAt });
  return push(ctx, newId(), full, now);
}

const editSchema = z.strictObject({ id: z.string().refine(isUuid, "Invalid id"), fields: bodyMetricInputSchema });

/** Replace the writable fields of one of the user's measurements (cleared inputs become null). */
export async function editBodyMetric(ctx: UserCtx, input: unknown, now: Date = new Date()): Promise<ActionResult<{ id: string }>> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return failure("Check the highlighted fields", fieldErrorsOf(parsed.error.issues));
  const existing = await prisma.bodyMetric.findFirst({ where: { id: parsed.data.id, userId: ctx.id, deletedAt: null }, select: { localDate: true } });
  if (!existing) return failure("Measurement not found");
  const reconciled = await reconcile(ctx, parsed.data.fields);
  if (!reconciled.ok) return failure("Check the highlighted fields", reconciled.fieldErrors);
  const fields: Record<string, unknown> = { ...reconciled.fields };
  if (dateOnly(existing.localDate) !== reconciled.fields.localDate) {
    fields.measuredAt = measuredAtFor(reconciled.fields.localDate, await userTimezone(ctx), now);
  }
  return push(ctx, parsed.data.id, fields, now);
}

const deleteSchema = z.strictObject({ id: z.string().refine(isUuid, "Invalid id") });

/** Tombstone one of the user's measurements (other devices learn about it on their next sync). */
export async function deleteBodyMetric(ctx: UserCtx, input: unknown, now: Date = new Date()): Promise<ActionResult<{ id: string }>> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return failure("Invalid request", fieldErrorsOf(parsed.error.issues));
  const existing = await prisma.bodyMetric.findFirst({ where: { id: parsed.data.id, userId: ctx.id, deletedAt: null }, select: { id: true } });
  if (!existing) return failure("Measurement not found");
  return push(ctx, parsed.data.id, { deletedAt: now.toISOString() }, now);
}
