// GET /api/health  -> { ok: true }.   GET /api/health?db=1 -> also pings the database (use for preview smoke checks).
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const body: { ok: boolean; time: string; db?: "up" | "down"; error?: string } = { ok: true, time: new Date().toISOString() };
  if (url.searchParams.get("db") === "1") {
    try {
      await prisma.$queryRaw`SELECT 1`;
      body.db = "up";
    } catch (error) {
      body.ok = false;
      body.db = "down";
      body.error = error instanceof Error ? error.message : "unknown error";
    }
  }
  return NextResponse.json(body, { status: body.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
