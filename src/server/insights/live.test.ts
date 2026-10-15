// Opt-in live test: runs the REAL model on the demo lifter's facts. Costs tokens, so it only runs with INSIGHTS_LIVE=1
// (never in CI): `INSIGHTS_LIVE=1 pnpm exec vitest run --project unit src/server/insights/live.test.ts`.
import { mkdirSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { collectFactIds } from "@/contracts/insights";
import { getNarrativeClient, insightsModel } from "./client";
import { PROMPT_VERSION } from "./constants";
import { checkNarrative } from "./grounding";
import { generateNarrative } from "./narrative";
import { SYSTEM_PROMPT } from "./prompt";
import { demoFacts } from "./test-support";

const live = process.env.INSIGHTS_LIVE === "1" && !process.env.CI;

describe.skipIf(!live)("live narrative (INSIGHTS_LIVE=1)", () => {
  it("writes a grounded narrative for the demo lifter and reports usage", { timeout: 180_000 }, async () => {
    const facts = demoFacts();
    const client = getNarrativeClient();
    expect(client, "ANTHROPIC_API_KEY must be set").not.toBeNull();
    const model = insightsModel();

    const result = await generateNarrative(facts, { client, model });

    // Size of the cached system prompt, from the token-counting endpoint (system + one-word turn minus the one-word turn).
    const sdk = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const user = [{ role: "user" as const, content: "ok" }];
    const [withSystem, without] = await Promise.all([
      sdk.messages.countTokens({ model, system: SYSTEM_PROMPT, messages: user }),
      sdk.messages.countTokens({ model, messages: user }),
    ]);
    // The reporter swallows console output, so keep the numbers in a file (test-results/ is gitignored).
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      "test-results/insights-live.json",
      JSON.stringify({ model, promptVersion: PROMPT_VERSION, attempts: result.attempts, failure: result.failure, error: result.error, usage: result.usage, systemPromptTokens: withSystem.input_tokens - without.input_tokens, narrative: result.narrative }, null, 2),
    );

    expect(result.narrative).not.toBeNull();
    expect(checkNarrative(result.narrative!, facts)).toBeNull();
    expect(result.narrative!.actions.length).toBeLessThanOrEqual(3);
    for (const id of result.narrative!.sections.flatMap((s) => s.factRefs)) expect(collectFactIds(facts).has(id)).toBe(true);
  });
});
