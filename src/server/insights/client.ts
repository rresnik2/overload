// The Anthropic client for the weekly narrative, behind a minimal interface so tests (and the e2e fake) can stand in for the SDK.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/server/env";
import { createFakeNarrativeClient } from "./fake-client";

/** The one SDK call the pipeline makes. `Anthropic` satisfies it; unit tests pass a fake. */
export interface NarrativeClient {
  messages: {
    create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message>;
  };
}

let cached: NarrativeClient | undefined;

/**
 * The real client, or null when ANTHROPIC_API_KEY is missing (the pipeline then serves the rules-only cards).
 * `INSIGHTS_E2E_FAKE=1` swaps in a deterministic offline model for the Playwright run; it is ignored on Vercel production.
 */
export function getNarrativeClient(): NarrativeClient | null {
  if (process.env.INSIGHTS_E2E_FAKE === "1" && process.env.VERCEL_ENV !== "production") return (cached ??= createFakeNarrativeClient());
  const { ANTHROPIC_API_KEY } = env();
  if (!ANTHROPIC_API_KEY) return null;
  // Vercel Hobby functions stop at 60 s: one retry on transient errors, and a timeout that leaves room for the fallback.
  return (cached ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY, maxRetries: 1, timeout: 40_000 }));
}

export function insightsModel(): string {
  return process.env.INSIGHTS_E2E_FAKE === "1" && process.env.VERCEL_ENV !== "production" ? "fake-insights-model" : env().INSIGHTS_MODEL;
}
