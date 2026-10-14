// The ten insight rules + the runner. STUBS (stream D implements).
import { INSIGHT_RULE_IDS, type InsightRule, type InsightRuleId, type RunInsightRules } from "@/contracts/analytics";

function notImplemented(name: string): InsightRule {
  return () => {
    throw new Error(`not implemented: ${name}`);
  };
}

/** One entry per rule id, in INSIGHT_RULE_IDS order. D replaces each body; the keys and signature are frozen. */
export const INSIGHT_RULES: Record<InsightRuleId, InsightRule> = Object.fromEntries(
  INSIGHT_RULE_IDS.map((id) => [id, notImplemented(`insightRule:${id}`)]),
) as Record<InsightRuleId, InsightRule>;

export const runInsightRules: RunInsightRules = () => {
  throw new Error("not implemented: runInsightRules");
};
