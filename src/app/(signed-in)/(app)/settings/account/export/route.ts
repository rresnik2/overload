// GET /settings/account/export: the signed-in user's data as a JSON download.
import { exportAccountData } from "@/server/profile/export";
import { withUserRoute } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export const GET = withUserRoute(async (ctx) => {
  const data = await exportAccountData(ctx);
  const stamp = data.exportedAt.slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="overload-export-${stamp}.json"`,
      "cache-control": "private, no-store",
    },
  });
});
