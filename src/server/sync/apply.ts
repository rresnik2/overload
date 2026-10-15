import "server-only";
// Server side of POST /api/sync.
//
//   validate each mutation (shape done by the caller; owner, references, completeness here) -> lock SyncState FOR UPDATE
//   -> merge each row's mutations per field by HLC (shared src/lib/sync/merge.ts) -> every changed row gets the next
//   per-user version -> derive set columns -> orphan rule -> re-derive dependents -> rebuild PRs -> pull page.
//
// One short transaction, serialized per user by the SyncState row lock, so versions are assigned without gaps or races
// and a concurrent push can never be skipped by another device's cursor. `ctx` is the ONLY source of identity.
import type { Prisma } from "@/generated/prisma/client";
import { ENTITY_FIELDS_SCHEMAS, ENTITY_REFS, SYNC_ORDER, type EntityName } from "@/contracts/entities";
import {
  emptyChanges,
  type Mutation,
  type MutationResult,
  type RejectReason,
  type SyncRequest,
  type SyncResponse,
} from "@/contracts/sync";
import { localDateToDate } from "@/lib/dates";
import { clampHlc, createHlcClock } from "@/lib/sync/hlc";
import { emptyMergeState, mergeFields, rowHlc, type FieldValues, type MergeState } from "@/lib/sync/merge";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import { rebuildSeriesPrs } from "@/server/prs/rebuild";
import { Batch } from "./batch";
import { rederiveDependentSets } from "./dependents";
import { ADAPTERS, rowValues, toDbData, type DbRow } from "./entities";
import { applyOrphanRule } from "./orphans";
import { pullChanges } from "./pull";

export interface SyncEnvelope {
  deviceId: string;
  cursor: number;
  clientHlc: string;
}

/** One request position: a valid mutation, or one that failed validation upstream (rejected + dead-lettered here). */
export type MutationSlot =
  | { kind: "ok"; mutation: Mutation }
  | { kind: "invalid"; mutationId: string; entity: string; id: string; message: string; raw: unknown };

/**
 * Validate -> lock SyncState FOR UPDATE -> merge each mutation per field by HLC -> bump versions -> rebuild PRs -> pull changes.
 * `ctx` is the ONLY source of identity; the request body can never carry a userId.
 */
export async function applyServerMutations(ctx: UserCtx, request: SyncRequest): Promise<SyncResponse> {
  const { mutations, ...envelope } = request;
  return applySyncSlots(ctx, envelope, mutations.map((mutation) => ({ kind: "ok" as const, mutation })));
}

interface DeadLetter {
  mutationId: string;
  entity: string;
  entityId: string;
  reason: RejectReason;
  payload: unknown;
}

interface Group {
  entity: EntityName;
  id: string;
  items: { index: number; mutation: Mutation }[];
}

const MAX_PAYLOAD_CHARS = 50_000;

function deadLetterPayload(raw: unknown): Prisma.InputJsonValue {
  try {
    const text = JSON.stringify(raw) ?? "null";
    return text.length > MAX_PAYLOAD_CHARS ? { truncated: true, chars: text.length } : (JSON.parse(text) as Prisma.InputJsonValue);
  } catch {
    return { unserializable: true };
  }
}

function isDatabaseError(error: unknown): boolean {
  return typeof error === "object" && error !== null && error.constructor.name.startsWith("PrismaClient");
}

export async function applySyncSlots(ctx: UserCtx, envelope: SyncEnvelope, slots: MutationSlot[]): Promise<SyncResponse> {
  const nowMs = Date.now();
  const outcome = await prisma.$transaction((tx) => runBatch(new BatchInit(tx, ctx, envelope, slots, nowMs)));

  const page = outcome.reset
    ? { changes: emptyChanges(), cursor: 0, hasMore: true }
    : await pullChanges(ctx, envelope.cursor);

  const serverClock = createHlcClock({ nodeId: "server", now: () => nowMs });
  return {
    results: outcome.results,
    changes: page.changes,
    newPrs: outcome.newPrs,
    cursor: page.cursor,
    hasMore: page.hasMore,
    reset: outcome.reset,
    serverTime: new Date(nowMs).toISOString(),
    serverHlc: serverClock.receive(envelope.clientHlc),
  };
}

class BatchInit {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly ctx: UserCtx,
    readonly envelope: SyncEnvelope,
    readonly slots: MutationSlot[],
    readonly nowMs: number,
  ) {}
}

async function runBatch({ tx, ctx, envelope, slots, nowMs }: BatchInit) {
  // Lock this user's sync state: pushes for one user are serialized, versions are assigned under the lock.
  await tx.$executeRaw`INSERT INTO "SyncState" ("userId", "updatedAt") VALUES (${ctx.id}, now()) ON CONFLICT ("userId") DO NOTHING`;
  const [state] = await tx.$queryRaw<{ version: number; gcFloorVersion: number }[]>`
    SELECT "version", "gcFloorVersion" FROM "SyncState" WHERE "userId" = ${ctx.id} FOR UPDATE`;
  if (!state) throw new Error("SyncState row missing after upsert");

  const batch = new Batch(tx, ctx, nowMs, state.version);
  const results: MutationResult[] = new Array(slots.length);
  const deadLetters: DeadLetter[] = [];

  const reject = (index: number, mutationId: string, reason: RejectReason, message: string, entity: string, entityId: string, payload: unknown) => {
    results[index] = { mutationId, status: "rejected", reason, message };
    deadLetters.push({ mutationId, entity, entityId, reason, payload });
  };

  const groups = new Map<string, Group>();
  slots.forEach((slot, index) => {
    if (slot.kind === "invalid") {
      reject(index, slot.mutationId, "INVALID_SHAPE", slot.message, slot.entity, slot.id, slot.raw);
      return;
    }
    const { mutation } = slot;
    const key = `${mutation.entity}:${mutation.id}`;
    const group = groups.get(key) ?? { entity: mutation.entity, id: mutation.id, items: [] };
    group.items.push({ index, mutation });
    groups.set(key, group);
  });

  for (const entity of SYNC_ORDER) {
    const entityGroups = [...groups.values()].filter((g) => g.entity === entity);
    if (entityGroups.length > 0) await applyEntityGroups(batch, entity, entityGroups, results, reject);
  }

  await applyOrphanRule(batch);
  await rederiveDependentSets(batch);
  const newPrs = await rebuildSeriesPrs(tx, ctx, batch.seriesKeys);

  if (deadLetters.length > 0) {
    await tx.syncDeadLetter.createMany({
      data: deadLetters.map((d) => ({
        userId: ctx.id,
        mutationId: d.mutationId,
        entity: d.entity,
        entityId: d.entityId,
        reason: d.reason,
        payload: deadLetterPayload(d.payload),
      })),
    });
  }
  if (batch.currentVersion !== state.version) {
    await tx.syncState.update({ where: { userId: ctx.id }, data: { version: batch.currentVersion } });
  }

  return {
    results,
    newPrs,
    // A cursor older than the GC floor missed tombstones that no longer exist: the client must start over.
    reset: envelope.cursor > 0 && envelope.cursor < state.gcFloorVersion,
  };
}

type Reject = (index: number, mutationId: string, reason: RejectReason, message: string, entity: string, entityId: string, payload: unknown) => void;

async function applyEntityGroups(
  batch: Batch,
  entity: EntityName,
  groups: Group[],
  results: MutationResult[],
  reject: Reject,
): Promise<void> {
  const { tx, ctx, nowMs } = batch;
  const adapter = ADAPTERS[entity];
  const delegate = adapter.delegate(tx);
  const ids = groups.map((g) => g.id);

  // Ownership: rows that exist for this user, and rows that exist but belong to someone else (or are catalog rows).
  const ownRows = await delegate.findMany({ where: { id: { in: ids }, userId: ctx.id }, ...(adapter.include ? { include: adapter.include } : {}) });
  const own = new Map(ownRows.map((r) => [r.id as string, r]));
  const foreignRows = await delegate.findMany({
    // Only exercises can have a null owner (the global catalog); every other userId column is NOT NULL.
    where: { id: { in: ids }, ...(entity === "exercise" ? { OR: [{ userId: null }, { userId: { not: ctx.id } }] } : { userId: { not: ctx.id } }) },
    select: { id: true, userId: true },
  });
  const foreign = new Map(foreignRows.map((r) => [r.id as string, r.userId as string | null]));

  // References: every parent id these groups mention, resolved in bulk (parents were applied earlier in SYNC_ORDER).
  const refIds = new Map<EntityName, Set<string>>();
  for (const ref of ENTITY_REFS[entity]) {
    const wanted = new Set<string>();
    for (const g of groups) for (const it of g.items) {
      const v = (it.mutation.fields as FieldValues)[ref.field];
      if (typeof v === "string") wanted.add(v);
    }
    if (wanted.size > 0) refIds.set(ref.entity, new Set([...(refIds.get(ref.entity) ?? []), ...wanted]));
  }
  const known = new Map<EntityName, Set<string>>();
  for (const [target, wanted] of refIds) {
    const rows = await ADAPTERS[target].delegate(tx).findMany({
      where: { id: { in: [...wanted] }, OR: target === "exercise" ? [{ userId: ctx.id }, { userId: null }] : [{ userId: ctx.id }] },
      select: { id: true },
    });
    known.set(target, new Set(rows.map((r) => r.id as string)));
  }

  for (const group of groups) {
    const failGroup = (reason: RejectReason, message: string) => {
      for (const it of group.items) reject(it.index, it.mutation.mutationId, reason, message, entity, group.id, it.mutation);
    };

    try {
      if (foreign.has(group.id)) {
        if (entity === "exercise" && foreign.get(group.id) === null) failGroup("CATALOG_READONLY", "Catalog exercises are read-only");
        else failGroup("NOT_OWNER", "This row belongs to another user");
        continue;
      }

      const existingDb: DbRow | undefined = own.get(group.id);
      const existing = existingDb ? adapter.toRow(existingDb) : undefined;
      let merged: MergeState = existing ? { values: rowValues(entity, existing), fieldHlc: { ...existing.fieldHlc } } : emptyMergeState();
      const changed = new Set<string>();
      const statuses: ("applied" | "noop")[] = [];
      for (const it of group.items) {
        const fieldHlc = Object.fromEntries(Object.entries(it.mutation.fieldHlc).map(([f, h]) => [f, clampHlc(h, nowMs)]));
        const r = mergeFields(merged, { fields: it.mutation.fields as FieldValues, fieldHlc });
        merged = r.state;
        for (const f of r.changed) changed.add(f);
        statuses.push(r.changed.length > 0 ? "applied" : "noop");
      }

      const isNew = !existing;
      let values = merged.values;
      if (isNew) {
        // A row the server has never seen must be complete once defaults are applied.
        const { deletedAt, ...writable } = values;
        const parsed = ENTITY_FIELDS_SCHEMAS[entity].safeParse(writable);
        if (!parsed.success) {
          const detail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
          failGroup("INVALID_SHAPE", `New ${entity} is incomplete or invalid: ${detail}`);
          continue;
        }
        values = { ...(parsed.data as FieldValues), deletedAt: deletedAt ?? null };
      } else if (changed.size === 0) {
        group.items.forEach((it, i) => (results[it.index] = { mutationId: it.mutation.mutationId, status: statuses[i] as "noop" }));
        continue;
      }

      // References must exist for this user (tombstoned parents still exist; the orphan rule handles them).
      const missing = ENTITY_REFS[entity].find((ref) => {
        const v = values[ref.field];
        const mentioned = isNew || group.items.some((it) => ref.field in (it.mutation.fields as object));
        return mentioned && typeof v === "string" && !known.get(ref.entity)?.has(v);
      });
      if (missing) {
        failGroup("MISSING_REFERENCE", `${missing.field} does not reference an existing ${missing.entity}`);
        continue;
      }

      let derivedData: Record<string, unknown> = {};
      if (entity === "workoutSet") {
        const derived = await batch.deriver.derive({
          workoutExerciseId: values.workoutExerciseId as string,
          weightKg: (values.weightKg as number | null) ?? null,
          reps: (values.reps as number | null) ?? null,
          rir: (values.rir as number | null) ?? null,
        });
        if (!derived) {
          failGroup("MISSING_REFERENCE", "The set's workout exercise, workout or exercise does not exist");
          continue;
        }
        derivedData = { ...derived, localDate: localDateToDate(derived.localDate) };
        if (existing) batch.seriesKeys.add(existing.seriesKey as string);
        batch.seriesKeys.add(derived.seriesKey);
      }

      const fieldHlc = merged.fieldHlc;
      const hlc = rowHlc(fieldHlc);
      const version = batch.nextVersion();
      if (isNew) {
        await delegate.create({ data: { id: group.id, userId: ctx.id, ...toDbData(entity, values), ...derivedData, hlc, fieldHlc, version } });
      } else {
        const data = toDbData(entity, Object.fromEntries([...changed].map((f) => [f, values[f]])));
        await delegate.update({ where: { id: group.id }, data: { ...data, ...derivedData, hlc, fieldHlc, version } });
      }
      if (entity === "exercise" && (isNew || changed.has("muscles"))) {
        const muscles = new Map<string, "PRIMARY" | "SECONDARY">();
        for (const m of (values.muscles ?? []) as { muscle: string; role: "PRIMARY" | "SECONDARY" }[]) {
          if (muscles.get(m.muscle) !== "PRIMARY") muscles.set(m.muscle, m.role);
        }
        await tx.exerciseMuscle.deleteMany({ where: { exerciseId: group.id } });
        if (muscles.size > 0) {
          await tx.exerciseMuscle.createMany({
            data: [...muscles].map(([muscle, role]) => ({ exerciseId: group.id, muscle: muscle as never, role })),
          });
        }
      }

      batch.deriver.invalidate(entity, group.id);
      batch.touched.push({ entity, id: group.id, isNew, changed: isNew ? new Set(Object.keys(values)) : changed, values });
      known.set(entity, (known.get(entity) ?? new Set()).add(group.id));
      group.items.forEach((it, i) => (results[it.index] = { mutationId: it.mutation.mutationId, status: statuses[i] as "applied" | "noop" }));
    } catch (error) {
      if (isDatabaseError(error)) throw error; // the transaction is aborted: the whole request fails and the client retries
      failGroup("INTERNAL", error instanceof Error ? error.message : "Unexpected error");
    }
  }
}
