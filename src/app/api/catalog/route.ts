// GET /api/catalog (ETag = catalogEtag(CatalogMeta.version), honour If-None-Match -> 304). Stream C implements.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "not implemented: GET /api/catalog" }, { status: 501 });
}
