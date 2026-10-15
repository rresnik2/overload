// GET /api/catalog: every global catalog exercise (CatalogResponse). ETag = catalogEtag(CatalogMeta.version);
// If-None-Match -> 304 so the offline client re-downloads the catalog only after a reseed. Requires a session.
import { catalogEtag } from "@/contracts/catalog";
import { withUserRoute } from "@/server/auth/session";
import { getCatalogVersion, loadCatalog } from "@/server/catalog/queries";

export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, max-age=0, must-revalidate";

/** Weak comparison (RFC 9110 8.8.3.2) of an If-None-Match header against our ETag; `*` matches anything. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  const strip = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((candidate) => candidate.trim() === "*" || strip(candidate) === strip(etag));
}

export const GET = withUserRoute(async (_ctx, request) => {
  const version = await getCatalogVersion();
  const etag = catalogEtag(version);
  const headers = { ETag: etag, "Cache-Control": CACHE_CONTROL };
  if (matchesEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return Response.json(await loadCatalog(version), { headers });
});
