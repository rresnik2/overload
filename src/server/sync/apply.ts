// Server side of POST /api/sync. STUB (stream E1 implements; signature frozen in CONTRACTS.md).
import type { UserCtx } from "@/server/auth/ctx";
import type { SyncRequest, SyncResponse } from "@/contracts/sync";

/**
 * Validate -> lock SyncState FOR UPDATE -> merge each mutation per field by HLC -> bump versions -> rebuild PRs -> pull changes.
 * `ctx` is the ONLY source of identity; the request body can never carry a userId.
 */
export async function applyServerMutations(_ctx: UserCtx, _request: SyncRequest): Promise<SyncResponse> {
  throw new Error("not implemented: applyServerMutations");
}
