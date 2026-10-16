// Persistence of InsightReport rows. Every query filters by ctx.id. The pipeline talks to the ReportStore interface so its
// rules (dedupe, cap, fallback) are unit-tested against an in-memory store; PrismaReportStore is the real thing.
import "server-only";
import { Prisma, type InsightReport } from "@/generated/prisma/client";
import { InsightStatus, InsightTrigger } from "@/contracts/enums";
import {
  INSIGHT_FACTS_VERSION,
  insightFactsSchema,
  insightNarrativeSchema,
  type InsightFacts,
  type InsightNarrative,
  type InsightReportRow,
} from "@/contracts/insights";
import { dateToLocalDate, localDateToDate } from "@/lib/dates";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { loadProfileRowCached } from "@/server/profile/row";
import { PENDING_STALE_MS } from "./constants";

/** A stored report plus what the pipeline needs to decide whether to regenerate. `row` is null when the stored JSON no longer parses. */
export interface StoredReport {
  id: string;
  status: InsightStatus;
  factsHash: string;
  onDemandCount: number;
  updatedAt: Date;
  row: InsightReportRow | null;
}

export type BeginResult = { ok: true; id: string } | { ok: false; reason: "rate_limited" | "in_progress" };

export interface FinishData {
  status: typeof InsightStatus.READY | typeof InsightStatus.FAILED;
  facts: InsightFacts;
  factsHash: string;
  narrative: InsightNarrative | null;
  model: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  trigger: InsightTrigger;
}

export interface ReportStore {
  timezoneOf(ctx: UserCtx): Promise<string | null>;
  find(ctx: UserCtx, weekStart: string): Promise<StoredReport | null>;
  /**
   * Claim the (user, week) report for a model call: creates it PENDING, or flips an existing one to PENDING. An on-demand
   * claim consumes one of the weekly regenerations and is refused at the cap. A fresh PENDING report is never claimed twice.
   */
  begin(ctx: UserCtx, args: { weekStart: string; trigger: InsightTrigger; facts: InsightFacts; factsHash: string; maxOnDemand: number; now: Date }): Promise<BeginResult>;
  finish(ctx: UserCtx, id: string, data: FinishData): Promise<InsightReportRow>;
  /** Write a report without a model call (empty week, missing API key): no on-demand count is consumed. */
  save(ctx: UserCtx, args: { weekStart: string } & FinishData): Promise<InsightReportRow>;
}

export function toReportRow(r: InsightReport): InsightReportRow | null {
  const facts = insightFactsSchema.safeParse(r.facts);
  if (!facts.success) return null;
  const narrative = r.narrative == null ? null : insightNarrativeSchema.safeParse(r.narrative);
  return {
    id: r.id,
    weekStart: dateToLocalDate(r.weekStart),
    status: r.status,
    trigger: r.trigger,
    factsVersion: r.factsVersion,
    facts: facts.data,
    factsHash: r.factsHash,
    narrative: narrative?.success ? narrative.data : null,
    model: r.model,
    promptVersion: r.promptVersion,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    error: r.error,
    onDemandCount: r.onDemandCount,
    generatedAt: r.generatedAt ? r.generatedAt.toISOString() : null,
  };
}

const json = (v: unknown) => v as Prisma.InputJsonValue;

function fields(data: FinishData) {
  return {
    status: data.status,
    trigger: data.trigger,
    factsVersion: INSIGHT_FACTS_VERSION,
    facts: json(data.facts),
    factsHash: data.factsHash,
    narrative: data.narrative ? json(data.narrative) : Prisma.DbNull,
    model: data.model,
    promptVersion: data.promptVersion,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    error: data.error,
    generatedAt: new Date(),
  };
}

async function reload(ctx: UserCtx, id: string): Promise<InsightReportRow> {
  const r = await prisma.insightReport.findFirstOrThrow({ where: { id, userId: ctx.id } });
  const row = toReportRow(r);
  if (!row) throw new Error("Stored insight report failed validation");
  return row;
}

export const prismaReportStore: ReportStore = {
  async timezoneOf(ctx) {
    const p = await loadProfileRowCached(ctx);
    return p?.timezone ?? null;
  },

  async find(ctx, weekStart) {
    const r = await prisma.insightReport.findUnique({ where: { userId_weekStart: { userId: ctx.id, weekStart: localDateToDate(weekStart) } } });
    return r ? { id: r.id, status: r.status, factsHash: r.factsHash, onDemandCount: r.onDemandCount, updatedAt: r.updatedAt, row: toReportRow(r) } : null;
  },

  async begin(ctx, { weekStart, trigger, facts, factsHash, maxOnDemand, now }) {
    const onDemand = trigger === InsightTrigger.ON_DEMAND;
    const where = { userId_weekStart: { userId: ctx.id, weekStart: localDateToDate(weekStart) } };
    const existing = await prisma.insightReport.findUnique({ where });
    if (!existing) {
      try {
        const created = await prisma.insightReport.create({
          data: {
            userId: ctx.id,
            weekStart: localDateToDate(weekStart),
            status: InsightStatus.PENDING,
            trigger,
            factsVersion: INSIGHT_FACTS_VERSION,
            facts: json(facts),
            factsHash,
            onDemandCount: onDemand ? 1 : 0,
          },
        });
        return { ok: true, id: created.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, reason: "in_progress" };
        throw e;
      }
    }
    // One atomic UPDATE both enforces the weekly cap and refuses a second concurrent claim.
    const claimed = await prisma.insightReport.updateMany({
      where: {
        id: existing.id,
        userId: ctx.id,
        ...(onDemand ? { onDemandCount: { lt: maxOnDemand } } : {}),
        OR: [{ status: { not: InsightStatus.PENDING } }, { updatedAt: { lt: new Date(now.getTime() - PENDING_STALE_MS) } }],
      },
      data: { status: InsightStatus.PENDING, trigger, ...(onDemand ? { onDemandCount: { increment: 1 } } : {}) },
    });
    if (claimed.count === 1) return { ok: true, id: existing.id };
    const fresh = await prisma.insightReport.findUnique({ where });
    return { ok: false, reason: onDemand && fresh && fresh.onDemandCount >= maxOnDemand ? "rate_limited" : "in_progress" };
  },

  async finish(ctx, id, data) {
    const updated = await prisma.insightReport.updateMany({ where: { id, userId: ctx.id }, data: fields(data) });
    if (updated.count !== 1) throw new Error("Insight report disappeared while generating");
    return reload(ctx, id);
  },

  async save(ctx, { weekStart, ...data }) {
    const where = { userId_weekStart: { userId: ctx.id, weekStart: localDateToDate(weekStart) } };
    const r = await prisma.insightReport.upsert({
      where,
      create: { userId: ctx.id, weekStart: localDateToDate(weekStart), onDemandCount: 0, ...fields(data) },
      update: fields(data),
    });
    return reload(ctx, r.id);
  },
};

/** Newest week first. Rows whose stored JSON no longer parses (an older facts version) are skipped. */
export async function listReports(ctx: UserCtx, limit = 12): Promise<InsightReportRow[]> {
  const rows = await prisma.insightReport.findMany({ where: { userId: ctx.id }, orderBy: { weekStart: "desc" }, take: limit });
  return rows.flatMap((r) => toReportRow(r) ?? []);
}

export async function latestReport(ctx: UserCtx): Promise<InsightReportRow | null> {
  return (await listReports(ctx, 1))[0] ?? null;
}
