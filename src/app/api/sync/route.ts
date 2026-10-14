// POST /api/sync. Stream E1 implements (validate with syncRequestSchema, call applyServerMutations via withUserRoute).
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "not implemented: POST /api/sync" }, { status: 501 });
}
