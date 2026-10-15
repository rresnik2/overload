// Applying a /api/sync response to the local database, in ONE Dexie transaction: acknowledged outbox entries are
// dropped, pulled rows are merged with local rows per field (a pending local edit with a later HLC survives; the
// server wins ties and owns the derived columns), the cursor and the device clock advance, and `reset` wipes the
// synced tables (keeping the outbox and any row that still has a pending write).
import { ENTITY_NAMES, ENTITY_WRITABLE_FIELDS, type EntityName, type WorkoutSetRow } from "@/contracts/entities";
import type { MutationResult, SyncResponse } from "@/contracts/sync";
import { maxHlc } from "@/lib/sync/hlc";
import { mergeFields, rowHlc } from "@/lib/sync/merge";
import { receiveHlc } from "@/client/db/clock";
import { dx } from "@/client/db/zone";
import { META_KEYS, setMeta, type OverloadDb } from "@/client/db/schema";
import { deriveLocal, nowIso, writeTx, type AnyRow } from "@/client/repo/core";
import type { OutboxBatch } from "./outbox";

export interface ApplyOutcome {
  pushed: number;
  rejected: number;
  pulled: number;
  rejections: { mutationId: string; entity: string; id: string; reason: string; message: string }[];
}

function pick(row: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

/** Merge a server row into the local row of the same id (undefined = not present locally). */
export function mergeServerRow(entity: EntityName, local: AnyRow | undefined, server: AnyRow): { row: AnyRow; localAhead: boolean } {
  if (!local) return { row: server, localAhead: false };
  const writable = [...ENTITY_WRITABLE_FIELDS[entity], "deletedAt"];
  const serverFieldHlc = Object.fromEntries(Object.entries(server.fieldHlc).filter(([f]) => writable.includes(f)));
  const base = { values: pick(local, writable), fieldHlc: pick(local.fieldHlc, writable) as Record<string, string> };
  const merged = mergeFields(base, { fields: pick(server, writable), fieldHlc: serverFieldHlc }, { tie: "incoming" });
  const values = { ...merged.state.values };
  // Fields the local row has never had (an older app version) come from the server.
  for (const f of writable) if (values[f] === undefined && server[f] !== undefined) values[f] = server[f];
  const fieldHlc = { ...local.fieldHlc, ...merged.state.fieldHlc };
  const localAhead = writable.some((f) => (merged.state.fieldHlc[f] ?? "") > (serverFieldHlc[f] ?? ""));
  const row: AnyRow = {
    ...server,
    ...values,
    fieldHlc,
    hlc: maxHlc([rowHlc(fieldHlc), server.hlc]),
    version: server.version as number,
    updatedAt: (local.updatedAt as string) > (server.updatedAt as string) && localAhead ? (local.updatedAt as string) : (server.updatedAt as string),
  };
  return { row, localAhead };
}

const wipeSynced = dx(async function wipeSynced(db: OverloadDb): Promise<void> {
  const pending = new Set((await db.outbox.toArray()).map((e) => `${e.entity}:${e.id}`));
  for (const entity of ENTITY_NAMES) {
    const table = db.entityTable(entity);
    const doomed = (await table.toCollection().primaryKeys()).filter((id) => !pending.has(`${entity}:${id}`));
    await table.bulkDelete(doomed);
  }
  await setMeta(db, META_KEYS.cursor, 0);
});

export function applyResponse(db: OverloadDb, batch: OutboxBatch, response: SyncResponse): Promise<ApplyOutcome> {
  return writeTx(db, async () => {
    const outcome: ApplyOutcome = { pushed: 0, rejected: 0, pulled: 0, rejections: [] };

    // 1. The server processed every mutation of the batch (applied, noop or rejected): drop them from the outbox.
    await db.outbox.bulkDelete(batch.seqs.flat());
    response.results.forEach((result: MutationResult, i) => {
      if (result.status === "rejected") {
        const m = batch.mutations[i];
        outcome.rejected += 1;
        outcome.rejections.push({ mutationId: result.mutationId, entity: m?.entity ?? "", id: m?.id ?? "", reason: result.reason ?? "", message: result.message ?? "" });
      } else outcome.pushed += 1;
    });

    // 2. The device clock catches up with the server's.
    await receiveHlc(db, response.serverHlc);

    // 3. Rows.
    if (response.reset) {
      await wipeSynced(db);
      return outcome;
    }
    const touchedSets: AnyRow[] = [];
    for (const entity of ENTITY_NAMES) {
      const incoming = response.changes[entity] as unknown as AnyRow[];
      if (incoming.length === 0) continue;
      const table = db.entityTable(entity);
      const locals = (await table.bulkGet(incoming.map((r) => r.id))) as (AnyRow | undefined)[];
      const rows: AnyRow[] = [];
      incoming.forEach((server, i) => {
        const { row, localAhead } = mergeServerRow(entity, locals[i], server);
        rows.push(row);
        if (entity === "workoutSet" && localAhead) touchedSets.push(row);
      });
      await table.bulkPut(rows);
      outcome.pulled += rows.length;
    }
    // A pending local edit that beat the server's value changes what the server's derived columns mean: re-mirror them.
    for (const set of touchedSets) {
      const derived = await deriveLocal(db, set as unknown as WorkoutSetRow);
      if (derived) await db.workoutSet.put({ ...(set as unknown as WorkoutSetRow), ...derived });
    }
    await setMeta(db, META_KEYS.cursor, response.cursor);
    await setMeta(db, META_KEYS.lastSyncedAt, nowIso());
    return outcome;
  });
}
