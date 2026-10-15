// generateNarrative: facts -> validated InsightNarrative, or a documented fallback (narrative null, rule cards still shown).
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { insightNarrativeSchema, type InsightFacts, type InsightNarrative } from "@/contracts/insights";
import type { NarrativeClient } from "./client";
import { MAX_NARRATIVE_ATTEMPTS, NARRATIVE_MAX_TOKENS } from "./constants";
import { checkNarrative, describeProblems } from "./grounding";
import { buildUserMessage, SYSTEM_PROMPT } from "./prompt";

export interface TokenUsage {
  /** Prompt tokens: uncached + cache writes + cache reads. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type NarrativeFailure = "no_api_key" | "refusal" | "truncated" | "invalid_output" | "ungrounded" | "api_error";

export interface NarrativeResult {
  narrative: InsightNarrative | null;
  /** Set when narrative is null. */
  failure: NarrativeFailure | null;
  /** Human-readable detail for InsightReport.error. */
  error: string | null;
  usage: TokenUsage;
  attempts: number;
  model: string;
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

function addUsage(total: TokenUsage, u: Anthropic.Messages.Usage): TokenUsage {
  const read = u.cache_read_input_tokens ?? 0;
  const write = u.cache_creation_input_tokens ?? 0;
  return {
    inputTokens: total.inputTokens + u.input_tokens + read + write,
    outputTokens: total.outputTokens + u.output_tokens,
    cacheReadTokens: total.cacheReadTokens + read,
    cacheWriteTokens: total.cacheWriteTokens + write,
  };
}

function textOf(message: Anthropic.Messages.Message): string {
  return message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

/**
 * One call plus at most one retry. The retry shows the model its own output and what was wrong with it (numbers not in the
 * facts, unknown factRefs, tone), which is cheaper and more reliable than a blind resample. Never throws: every failure
 * comes back as `narrative: null` so the caller can fall back to the rules-only cards.
 */
export async function generateNarrative(
  facts: InsightFacts,
  deps: { client: NarrativeClient | null; model: string },
): Promise<NarrativeResult> {
  const { client, model } = deps;
  const base = { narrative: null, attempts: 0, model };
  if (!client) return { ...base, failure: "no_api_key", error: "ANTHROPIC_API_KEY is not configured", usage: ZERO_USAGE };

  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: buildUserMessage(facts) }];
  let usage = ZERO_USAGE;
  let failure: NarrativeFailure = "invalid_output";
  let error = "";

  for (let attempt = 1; attempt <= MAX_NARRATIVE_ATTEMPTS; attempt++) {
    let message: Anthropic.Messages.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: NARRATIVE_MAX_TOKENS,
        // Static system prompt, cached: every report shares this prefix, only the facts turn changes.
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { format: zodOutputFormat(insightNarrativeSchema) },
      });
    } catch (e) {
      // Typed SDK errors carry a status; anything else (network, abort) still ends in the fallback.
      const status = (e as { status?: number }).status;
      return { ...base, attempts: attempt, failure: "api_error", error: `Anthropic request failed${status ? ` (${status})` : ""}: ${e instanceof Error ? e.message : "unknown error"}`.slice(0, 500), usage };
    }
    usage = addUsage(usage, message.usage);

    if (message.stop_reason === "refusal") return { ...base, attempts: attempt, failure: "refusal", error: "The model declined to write this review", usage };
    if (message.stop_reason === "max_tokens") {
      failure = "truncated";
      error = "The narrative was cut off at the output limit";
      continue;
    }

    const raw = textOf(message);
    let parsed: ReturnType<typeof insightNarrativeSchema.safeParse>;
    try {
      parsed = insightNarrativeSchema.safeParse(JSON.parse(raw));
    } catch {
      parsed = { success: false, error: new Error("not JSON") } as never;
    }
    if (!parsed.success) {
      failure = "invalid_output";
      error = "The model's output did not match the narrative schema";
      messages.push({ role: "assistant", content: raw || "(empty)" }, { role: "user", content: "That was not valid JSON for the requested schema (headline, summary, 1-5 sections each with factRefs, at most 3 actions). Return only the corrected JSON object." });
      continue;
    }

    const problems = checkNarrative(parsed.data, facts);
    if (!problems) return { ...base, attempts: attempt, narrative: parsed.data, failure: null, error: null, usage };
    failure = "ungrounded";
    error = `Narrative rejected: ${describeProblems(problems).replaceAll("\n", " ")}`.slice(0, 500);
    messages.push({ role: "assistant", content: raw }, { role: "user", content: `${describeProblems(problems)}\nRewrite the review and return only the corrected JSON object.` });
  }
  return { ...base, attempts: MAX_NARRATIVE_ATTEMPTS, failure, error, usage };
}
