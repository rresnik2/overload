// Outbox -> request batches. Raw outbox entries are one per write; at push time the entries of the same row are
// coalesced into ONE mutation (per-field last-write-wins by HLC, the same merge the server uses), so a note typed
// into a set key by key costs one mutation, not forty. The coalesced mutation reuses the first entry's mutationId.
import { SYNC_MAX_MUTATIONS, type Mutation } from "@/contracts/sync";
import { emptyMergeState, mergeFields } from "@/lib/sync/merge";
import type { OutboxEntry, OverloadDb } from "@/client/db/schema";

export interface OutboxBatch {
  mutations: Mutation[];
  /** For each mutation (same index): the outbox sequence numbers it covers. */
  seqs: number[][];
}

/** How many raw entries to read when building one batch (enough to fill 200 coalesced mutations in the common case). */
const RAW_WINDOW = SYNC_MAX_MUTATIONS * 3;

export function coalesce(entries: OutboxEntry[], max = SYNC_MAX_MUTATIONS): OutboxBatch {
  const groups = new Map<string, OutboxEntry[]>();
  for (const entry of entries) {
    const key = `${entry.entity}:${entry.id}`;
    const group = groups.get(key);
    if (group) group.push(entry);
    else if (groups.size < max) groups.set(key, [entry]);
  }
  const mutations: Mutation[] = [];
  const seqs: number[][] = [];
  for (const group of groups.values()) {
    let state = emptyMergeState();
    for (const entry of group) state = mergeFields(state, { fields: entry.fields, fieldHlc: entry.fieldHlc }).state;
    const first = group[0] as OutboxEntry;
    mutations.push({
      mutationId: first.mutationId,
      entity: first.entity,
      id: first.id,
      fields: state.values,
      fieldHlc: state.fieldHlc,
    } as Mutation);
    seqs.push(group.map((e) => e.seq as number));
  }
  return { mutations, seqs };
}

export async function readBatch(db: OverloadDb): Promise<OutboxBatch> {
  const entries = await db.outbox.orderBy("seq").limit(RAW_WINDOW).toArray();
  return coalesce(entries);
}
