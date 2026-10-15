// Constants of the weekly insight pipeline. Cost controls live here so tests and code share one definition.

/** Stored on every report (InsightReport.promptVersion). Bump it whenever SYSTEM_PROMPT or the output schema changes. */
export const PROMPT_VERSION = "insights-2026-10-14.1";

/** At most this many on-demand model calls per report week (InsightReport.onDemandCount). */
export const MAX_ON_DEMAND_PER_WEEK = 3;

/** One try plus one retry (with feedback) before falling back to the rules-only cards. */
export const MAX_NARRATIVE_ATTEMPTS = 2;

/** Output budget. Thinking tokens count toward it on thinking models; the narrative itself is ~1-2k tokens. */
export const NARRATIVE_MAX_TOKENS = 8000;

/** A PENDING report older than this is treated as a crashed run and may be started again. */
export const PENDING_STALE_MS = 3 * 60_000;

/** The cron stops starting new users after this long (Vercel Hobby functions are limited to 60 s). */
export const CRON_TIME_BUDGET_MS = 45_000;
export const CRON_CONCURRENCY = 3;
