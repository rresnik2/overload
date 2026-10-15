// The daily insights cron (Vercel Hobby runs crons at most once a day, 12:00 UTC per vercel.json): every user whose review
// week has no READY report yet gets one. One user's failure never stops the rest; concurrency and wall-clock are bounded.
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { InsightStatus, InsightTrigger } from "@/contracts/enums";
import { localDateToDate, toLocalDate } from "@/lib/dates";
import { mintUserCtx, type UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { CRON_CONCURRENCY, CRON_TIME_BUDGET_MS } from "./constants";
import { defaultDeps, generateInsightReport, reviewWeekStart, type GenerateResult, type PipelineDeps } from "./pipeline";

/** `Authorization: Bearer <CRON_SECRET>`. A missing secret never authorizes anything. Constant-time compare. */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

export interface CronUser {
  id: string;
  timezone: string;
}

export interface CronStore {
  /** Onboarded users with insights enabled. */
  eligibleUsers(): Promise<CronUser[]>;
  /** `${userId}|${weekStart}` of every READY report among these users and weeks. */
  readyReports(userIds: string[], weekStarts: string[]): Promise<Set<string>>;
}

export const prismaCronStore: CronStore = {
  async eligibleUsers() {
    const rows = await prisma.profile.findMany({
      where: { insightsEnabled: true, onboardedAt: { not: null } },
      select: { userId: true, timezone: true },
      orderBy: { userId: "asc" },
    });
    return rows.map((r) => ({ id: r.userId, timezone: r.timezone }));
  },
  async readyReports(userIds, weekStarts) {
    if (!userIds.length) return new Set();
    const rows = await prisma.insightReport.findMany({
      where: { userId: { in: userIds }, weekStart: { in: weekStarts.map(localDateToDate) }, status: InsightStatus.READY },
      select: { userId: true, weekStart: true },
    });
    return new Set(rows.map((r) => `${r.userId}|${r.weekStart.toISOString().slice(0, 10)}`));
  },
};

export interface CronSummary {
  eligible: number;
  alreadyReady: number;
  generated: number;
  cached: number;
  empty: number;
  failed: number;
  errors: number;
  /** Users left for tomorrow because the time budget ran out. */
  deferred: number;
}

export interface CronDeps {
  store: CronStore;
  now: () => Date;
  /** Runs the pipeline for one user. Defaults to the real pipeline. */
  generate: (ctx: UserCtx) => Promise<GenerateResult>;
  concurrency: number;
  budgetMs: number;
}

export function defaultCronDeps(): CronDeps {
  const pipeline: PipelineDeps = defaultDeps();
  return {
    store: prismaCronStore,
    now: pipeline.now,
    generate: (ctx) => generateInsightReport(ctx, { trigger: InsightTrigger.CRON }, pipeline),
    concurrency: CRON_CONCURRENCY,
    budgetMs: CRON_TIME_BUDGET_MS,
  };
}

/** The user's review week, from the user's own time zone (an unknown zone falls back to UTC). */
export function reviewWeekFor(now: Date, timezone: string): string {
  let today: string;
  try {
    today = toLocalDate(now, timezone);
  } catch {
    today = toLocalDate(now, "UTC");
  }
  return reviewWeekStart(today);
}

export async function runInsightsCron(deps: CronDeps = defaultCronDeps()): Promise<CronSummary> {
  const started = Date.now();
  const now = deps.now();
  const users = await deps.store.eligibleUsers();
  const weekOf = new Map(users.map((u) => [u.id, reviewWeekFor(now, u.timezone)]));
  const ready = await deps.store.readyReports(users.map((u) => u.id), [...new Set(weekOf.values())]);
  const todo = users.filter((u) => !ready.has(`${u.id}|${weekOf.get(u.id)}`));

  const summary: CronSummary = { eligible: users.length, alreadyReady: users.length - todo.length, generated: 0, cached: 0, empty: 0, failed: 0, errors: 0, deferred: 0 };
  let next = 0;
  const worker = async () => {
    for (;;) {
      const user = todo[next++];
      if (!user) return;
      if (Date.now() - started > deps.budgetMs) {
        summary.deferred += 1;
        continue;
      }
      try {
        const result = await deps.generate(mintUserCtx(user.id));
        if (result.status === "generated") summary.generated += 1;
        else if (result.status === "cached") summary.cached += 1;
        else if (result.status === "empty") summary.empty += 1;
        else if (result.status === "failed") summary.failed += 1;
      } catch {
        summary.errors += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, deps.concurrency) }, worker));
  return summary;
}
