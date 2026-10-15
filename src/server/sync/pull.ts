import "server-only";
// The pull half of /api/sync: rows with version > cursor, at most SYNC_MAX_PULL_ROWS across all entities, ordered by
// version. Versions are unique per user (one counter, one value per row write), so cursor paging can never skip a row.
//
// Consistency: `SyncState.version` is committed in the same transaction as the rows it numbers. We read it FIRST (S) and
// then only rows with version <= S: every such row is already committed, and anything committed later is > S. So the
// returned cursor (S, or the last returned row's version when more pages wait) never goes past rows we included.
import { ENTITY_NAMES, type EntityName } from "@/contracts/entities";
import { SYNC_MAX_PULL_ROWS, emptyChanges, type SyncChanges } from "@/contracts/sync";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { ADAPTERS, type Tx, type WireRow } from "./entities";

export interface PullPage {
  changes: SyncChanges;
  cursor: number;
  hasMore: boolean;
}

export async function pullChanges(ctx: UserCtx, cursor: number, db: Tx = prisma): Promise<PullPage> {
  const state = await db.syncState.findUnique({ where: { userId: ctx.id }, select: { version: true } });
  const upTo = state?.version ?? 0;
  if (upTo <= cursor) return { changes: emptyChanges(), cursor: Math.max(upTo, 0), hasMore: false };

  const perEntity = await Promise.all(
    ENTITY_NAMES.map(async (entity) => {
      const adapter = ADAPTERS[entity];
      const rows = await adapter.delegate(db).findMany({
        where: { userId: ctx.id, version: { gt: cursor, lte: upTo } },
        orderBy: { version: "asc" },
        take: SYNC_MAX_PULL_ROWS + 1,
        ...(adapter.include ? { include: adapter.include } : {}),
      });
      return rows.map((row) => ({ entity, version: row.version as number, row: adapter.toRow(row) }));
    }),
  );

  const merged = perEntity.flat().sort((a, b) => a.version - b.version);
  const hasMore = merged.length > SYNC_MAX_PULL_ROWS;
  const page = hasMore ? merged.slice(0, SYNC_MAX_PULL_ROWS) : merged;

  const changes = emptyChanges();
  for (const { entity, row } of page) (changes[entity as EntityName] as unknown as WireRow[]).push(row);
  return { changes, cursor: hasMore ? (page[page.length - 1] as { version: number }).version : upTo, hasMore };
}
