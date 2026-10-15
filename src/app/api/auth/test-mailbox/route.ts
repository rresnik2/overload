// GET /api/auth/test-mailbox?to=<email>: the in-memory outbox for e2e tests. 404 in production.
// (Specific routes win over the [...all] catch-all, so Better Auth never sees this path.)
import { readOutbox } from "@/server/email/outbox";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const to = new URL(request.url).searchParams.get("to") ?? undefined;
  return Response.json({ messages: readOutbox(to) }, { headers: { "cache-control": "no-store" } });
}
