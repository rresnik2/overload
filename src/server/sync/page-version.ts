import "server-only";
// The user's sync version, for the server pages that show synced data (see src/client/sync/SyncVersionStamp.tsx).
//
// ORDER MATTERS: `SyncState.version` is committed in the same transaction as the rows it numbers, so every row with a version
// <= V that exists when V is read is visible to any query that starts after. A page must therefore `await` this BEFORE it starts
// its own queries (the same rule `pullChanges` follows). Read after, or concurrently, V could count a row the page missed, and
// the client would skip a refresh it needs. Cached per request, so a page and its `generateMetadata` share one read.
import { cache } from "react";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";

const readVersion = cache(async (userId: string): Promise<number | null> => {
  try {
    const state = await prisma.syncState.findUnique({ where: { userId }, select: { version: true } });
    return state?.version ?? 0;
  } catch {
    return null; // no stamp: the client refreshes after a sync, as it did before stamps existed
  }
});

export function pageSyncVersion(ctx: UserCtx): Promise<number | null> {
  return readVersion(ctx.id);
}
