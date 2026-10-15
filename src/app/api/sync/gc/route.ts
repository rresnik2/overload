// GET /api/sync/gc: daily tombstone garbage collection (vercel.json cron). Secured by `Authorization: Bearer ${CRON_SECRET}`.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { collectTombstones } from "@/server/sync/gc";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  // Read directly (not via env()): GC must not depend on unrelated variables being valid. Same rule as env.ts: min 16 chars.
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const summary = await collectTombstones();
  return NextResponse.json(summary, { headers: { "Cache-Control": "no-store" } });
}
