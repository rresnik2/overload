// The Anthropic client for the weekly narrative, behind a minimal interface so tests (and the e2e fake) can stand in for the SDK.
import Anthropic from "@anthropic-ai/sdk";
import { createFakeNarrativeClient } from "./fake-client";

/** The one SDK call the pipeline makes. `Anthropic` satisfies it; unit tests pass a fake. */
export interface NarrativeClient {
  messages: {
    create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message>;
  };
}

/** Same default as env.ts and .env.example. */
const DEFAULT_MODEL = "claude-opus-5-5";

let cached: NarrativeClient | undefined;

/**
 * The real client, or null when ANTHROPIC_API_KEY is missing (the pipeline then serves the rules-only cards).
 * `INSIGHTS_E2E_FAKE=1` swaps in a deterministic offline model for the Playwright run; it is ignored on Vercel production.
 */
export function isFakeModelEnabled(): boolean {
  return process.env.INSIGHTS_E2E_FAKE === "1" && process.env.VERCEL_ENV !== "production";
}

export function getNarrativeClient(): NarrativeClient | null {
  if (isFakeModelEnabled()) return (cached ??= createFakeNarrativeClient());
  // Not env(): it validates every variable at once and would take the insights down for an unrelated empty one.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  // Vercel Hobby functions stop at 60 s: one retry on transient errors, and a timeout that leaves room for the fallback.
  return (cached ??= new Anthropic({ apiKey, maxRetries: 1, timeout: 40_000 }));
}

export function insightsModel(): string {
  return isFakeModelEnabled() ? "fake-insights-model" : process.env.INSIGHTS_MODEL?.trim() || DEFAULT_MODEL;
}
