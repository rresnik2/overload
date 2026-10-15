// Offline stand-in for the SDK used by the e2e run (INSIGHTS_E2E_FAKE=1). Writes a grounded narrative from the facts in the
// user turn, so the whole pipeline (validation, storage, rendering) runs for real without spending tokens.
import type Anthropic from "@anthropic-ai/sdk";
import type { InsightFacts, InsightNarrative } from "@/contracts/insights";
import type { NarrativeClient } from "./client";

export function fakeNarrativeFor(facts: InsightFacts): InsightNarrative {
  const first = facts.insights[0];
  return {
    headline: `Week of ${facts.weekStart} in review`,
    summary: `You trained on ${facts.training.sessions} sessions with ${facts.training.hardSets} hard sets this week.`,
    sections: [
      { title: "Training", body: `You completed ${facts.training.completedSets} sets.`, factRefs: [facts.training.id] },
      ...(first ? [{ title: first.title.slice(0, 80), body: "The rules flagged this for you.", factRefs: [first.id] }] : []),
    ],
    actions: first ? [{ text: "Act on the flagged finding next week.", factRefs: [first.id] }] : [],
  };
}

export function createFakeNarrativeClient(): NarrativeClient {
  return {
    messages: {
      async create(params): Promise<Anthropic.Messages.Message> {
        const first = params.messages[0];
        const text = typeof first?.content === "string" ? first.content : "";
        const narrative = fakeNarrativeFor(JSON.parse(text) as InsightFacts);
        return {
          id: "msg_fake",
          type: "message",
          role: "assistant",
          model: params.model,
          content: [{ type: "text", text: JSON.stringify(narrative), citations: null }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        } as unknown as Anthropic.Messages.Message;
      },
    },
  };
}
