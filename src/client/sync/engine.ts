// Sync engine entry points. STUBS (stream E1 implements; signatures frozen in CONTRACTS.md).
// Safe no-ops in Phase 0 so the shell (stream B) can render SyncPip before the real engine lands.
import type { SyncReason, SyncResult } from "@/contracts/sync";

/** Run one sync cycle now (push outbox -> pull changes). navigator.locks keeps it to one at a time. */
export async function syncNow(_reason: SyncReason = "manual"): Promise<SyncResult> {
  return { ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [], skipped: true };
}
