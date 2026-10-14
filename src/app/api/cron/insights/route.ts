// GET /api/cron/insights (secured by CRON_SECRET: `Authorization: Bearer <CRON_SECRET>`). Stream G implements.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "not implemented: GET /api/cron/insights" }, { status: 501 });
}
