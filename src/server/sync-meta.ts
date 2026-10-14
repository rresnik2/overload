import "server-only";
// Helpers for SERVER-ORIGINATED writes to synced models (e.g. onboarding creates the first BodyMetric, the body form
// in stream F). Rows written outside /api/sync must still carry valid sync metadata, or devices would never pull them:
//   1. bump the user's SyncState.version inside the SAME transaction as the write and use it as the row's `version`;
//   2. give every written field an HLC (the server HLC below) so later client edits merge correctly.
// FROZEN after Phase 0. Stream E1's /api/sync does the same thing with real device HLCs (src/server/sync/**).
import type { Prisma } from "@/generated/prisma/client";
import type { UserCtx } from "@/server/auth/ctx";

/** HLC string in the frozen format (see src/contracts/sync.ts). nodeId "server" marks server-originated writes. */
export function serverHlc(nowMs: number = Date.now(), counter = 0): string {
  return `${String(nowMs).padStart(15, "0")}-${counter.toString(16).padStart(5, "0")}-server`;
}

/** Next per-user version (creates the SyncState row on first use). Call inside prisma.$transaction. */
export async function bumpSyncVersion(tx: Prisma.TransactionClient, ctx: UserCtx): Promise<number> {
  const state = await tx.syncState.upsert({
    where: { userId: ctx.id },
    create: { userId: ctx.id, version: 1 },
    update: { version: { increment: 1 } },
    select: { version: true },
  });
  return state.version;
}

/** The sync mixin columns for a server-written row: `{ hlc, fieldHlc, version }` (deletedAt/createdAt/updatedAt are defaults). */
export function syncMixin(version: number, writtenFields: readonly string[], nowMs: number = Date.now()) {
  const hlc = serverHlc(nowMs);
  return { hlc, fieldHlc: Object.fromEntries(writtenFields.map((f) => [f, hlc])), version };
}
