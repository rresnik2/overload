// Shared helpers for the insights unit tests (not imported by app code).
import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";
import { insightFactsSchema, type InsightFacts, type InsightNarrative } from "@/contracts/insights";
import { buildWeeklyFacts } from "@/lib/analytics/facts";
import { generateLifterHistory } from "@/lib/fixtures/generate";
import type { NarrativeClient } from "./client";
import { fakeNarrativeFor } from "./fake-client";

export const WEEK_START = "2026-10-05";

export function demoFacts(): InsightFacts {
  return insightFactsSchema.parse(buildWeeklyFacts(generateLifterHistory(), { weekStart: WEEK_START }));
}

/** A narrative whose numbers and ids all come from the facts. */
export function groundedNarrative(facts: InsightFacts): InsightNarrative {
  return fakeNarrativeFor(facts);
}

export function messageOf(body: unknown, over: Partial<Anthropic.Messages.Message> = {}): Anthropic.Messages.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text: typeof body === "string" ? body : JSON.stringify(body), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ...over,
  } as unknown as Anthropic.Messages.Message;
}

/** A mocked SDK client that answers with the given replies in order (the last one repeats). */
export function mockClient(...replies: (Anthropic.Messages.Message | Error)[]) {
  const create = vi.fn(async (_params: Anthropic.Messages.MessageCreateParamsNonStreaming) => {
    const reply = replies[Math.min(create.mock.calls.length - 1, replies.length - 1)]!;
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const client: NarrativeClient = { messages: { create } };
  return { client, create };
}
