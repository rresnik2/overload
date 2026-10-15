"use server";
// Server Action for the online "Regenerate" button on /insights. The user comes from the session (withUser), never from the
// arguments; there are no arguments. The weekly cap and the factsHash dedupe are enforced in the pipeline.
import { revalidatePath } from "next/cache";
import { InsightTrigger } from "@/contracts/enums";
import { withUser } from "@/server/auth/session";
import { generateInsightReport, type GenerateStatus } from "@/server/insights/pipeline";

export interface RegenerateResult {
  status: GenerateStatus;
  /** On-demand regenerations left this week. */
  remaining: number;
}

export const regenerateInsightAction = withUser(async (ctx): Promise<RegenerateResult> => {
  const { status, remaining } = await generateInsightReport(ctx, { trigger: InsightTrigger.ON_DEMAND });
  if (status === "generated" || status === "failed" || status === "empty") revalidatePath("/insights");
  return { status, remaining };
});
