// POST /api/sync: a route handler (not a Server Action: action ids change every deploy and an offline client on an older
// bundle must keep working). withUserRoute -> parse -> applyServerMutations. The user comes only from the session.
import { NextResponse } from "next/server";
import { withUserRoute } from "@/server/auth/session";
import { applySyncSlots } from "@/server/sync/apply";
import { parseSyncBody } from "@/server/sync/parse";

export const maxDuration = 30;

export const POST = withUserRoute(async (ctx, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = parseSyncBody(body);
  if (!parsed.ok) return NextResponse.json({ error: "invalid sync request", details: parsed.error }, { status: 400 });
  const response = await applySyncSlots(ctx, parsed.envelope, parsed.slots);
  return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
});
