// GET /api/cron/insights: Vercel Cron (daily, 12:00 UTC) with `Authorization: Bearer ${CRON_SECRET}`.
// Not a user route: there is no session, so the per-user work runs under mintUserCtx inside the cron module.
import { isFakeModelEnabled } from "@/server/insights/client";
import { isCronAuthorized, runInsightsCron } from "@/server/insights/cron";

export const dynamic = "force-dynamic";
// Hobby functions are capped at 60 s; the cron stops starting new users well before that.
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    // The header lets the e2e spec tell whether the server runs the offline fake model (so it never spends tokens by accident).
    return Response.json({ error: "unauthorized" }, { status: 401, headers: isFakeModelEnabled() ? { "x-insights-fake-model": "1" } : {} });
  }
  const summary = await runInsightsCron();
  return Response.json(summary);
}
