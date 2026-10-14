// Sync wire protocol (POST /api/sync) + client engine status types. FROZEN after Phase 0.
// Pure TypeScript + Zod. Owner of the IMPLEMENTATIONS: stream E1 (never the shape; shape changes need a change request).
import { z } from "zod";
import {
  ENTITY_NAMES,
  ENTITY_PATCH_SCHEMAS,
  isoDateTimeSchema,
  uuidSchema,
  type EntityName,
  type EntityTypeMap,
  type IsoDateTime,
  type PersonalRecordRow,
} from "./entities";

// ───────────────────────────── limits ─────────────────────────────

/** Client sends at most this many mutations per request. */
export const SYNC_MAX_MUTATIONS = 200;
/** Server returns at most this many changed rows (across all entities) per page. */
export const SYNC_MAX_PULL_ROWS = 1000;
/** A client HLC more than this far ahead of server time is clamped to server time + this. */
export const SYNC_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
/** Tombstones older than this are garbage-collected; clients with an older cursor must reset. */
export const TOMBSTONE_TTL_DAYS = 90;

// ───────────────────────────── hybrid logical clock (string format) ─────────────────────────────

/**
 * HLC string: `${wallMs, 15 digits, zero padded}-${counter, 5 hex digits, zero padded}-${nodeId}`
 * e.g. "001791990000000-0000a-3f9c1b2d". With fixed widths, plain string comparison (`a < b`)
 * IS the causal order, so merge code and SQL can compare HLCs lexicographically.
 * nodeId is the device id (1-32 chars of [A-Za-z0-9]); it breaks ties deterministically.
 * Catalog rows and never-written fields use "" (compares lower than any real HLC).
 */
export const HLC_REGEX = /^\d{15}-[0-9a-f]{5}-[A-Za-z0-9]{1,32}$/;
export const hlcSchema = z.string().regex(HLC_REGEX);
export type Hlc = string;

export function isHlc(value: string): boolean {
  return HLC_REGEX.test(value);
}
/** Lexicographic HLC compare (valid because of the fixed-width format). "" sorts first. */
export function compareHlc(a: Hlc, b: Hlc): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ───────────────────────────── mutation (client -> server) ─────────────────────────────

/**
 * One row write. `fields` holds ONLY client-writable fields of that entity (plus `deletedAt` for tombstones/undelete);
 * `fieldHlc` carries one HLC per field in `fields` (same key set). Merge is last-write-wins PER FIELD by HLC, so
 * mutations are commutative and idempotent. A delete is `fields: { deletedAt: <iso> }`; undelete is `deletedAt: null`
 * with a later HLC. Unknown keys (userId, version, effectiveLoadKg, ...) fail validation -> `rejected: INVALID_SHAPE`.
 *
 * For an id the server has never seen, the merged fields must satisfy the entity's full Fields schema
 * (ENTITY_FIELDS_SCHEMAS[entity]) once defaults are applied, otherwise `rejected: INVALID_SHAPE`.
 */
const deletedAtField = { deletedAt: isoDateTimeSchema.nullable().optional() };

function sameKeys(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i]);
}

function mutationFor<E extends EntityName, S extends z.ZodObject>(entity: E, patch: S) {
  return z
    .strictObject({
      /** Idempotency key (UUIDv7). Replaying a batch is harmless: duplicate fields merge to the same row. */
      mutationId: uuidSchema,
      entity: z.literal(entity),
      /** Row id: client-generated UUIDv7. */
      id: uuidSchema,
      fields: patch.extend(deletedAtField),
      fieldHlc: z.record(z.string(), hlcSchema),
    })
    .refine((m) => sameKeys(m.fields as Record<string, unknown>, m.fieldHlc), {
      message: "fieldHlc must have exactly one HLC per field in `fields`",
      path: ["fieldHlc"],
    });
}

export const mutationSchema = z.discriminatedUnion("entity", [
  mutationFor("exercise", ENTITY_PATCH_SCHEMAS.exercise),
  mutationFor("machineProfile", ENTITY_PATCH_SCHEMAS.machineProfile),
  mutationFor("bodyMetric", ENTITY_PATCH_SCHEMAS.bodyMetric),
  mutationFor("template", ENTITY_PATCH_SCHEMAS.template),
  mutationFor("templateExercise", ENTITY_PATCH_SCHEMAS.templateExercise),
  mutationFor("workout", ENTITY_PATCH_SCHEMAS.workout),
  mutationFor("workoutExercise", ENTITY_PATCH_SCHEMAS.workoutExercise),
  mutationFor("workoutSet", ENTITY_PATCH_SCHEMAS.workoutSet),
]);
export type Mutation = z.infer<typeof mutationSchema>;

/** The loosest mutation shape (any entity), handy for generic client code (outbox). */
export interface MutationLike {
  mutationId: string;
  entity: EntityName;
  id: string;
  fields: Record<string, unknown>;
  fieldHlc: Record<string, Hlc>;
}

export const syncRequestSchema = z.strictObject({
  /** Stable per-install id (also the HLC nodeId source); used for logging and tie-breaking only. */
  deviceId: z.string().regex(/^[A-Za-z0-9]{1,32}$/),
  /** Highest SyncState.version this device has pulled (0 = first sync). */
  cursor: z.int().min(0),
  /** Device's current HLC; the server merges it into its own and replies with `serverHlc`. */
  clientHlc: hlcSchema,
  mutations: z.array(mutationSchema).max(SYNC_MAX_MUTATIONS),
});
export type SyncRequest = z.infer<typeof syncRequestSchema>;

// ───────────────────────────── response (server -> client) ─────────────────────────────

export const REJECT_REASONS = [
  "INVALID_SHAPE", // failed validation (unknown/forbidden field, bad value, incomplete new row)
  "NOT_OWNER", // the row id exists but belongs to another user
  "MISSING_REFERENCE", // a referenced row does not exist for this user
  "CATALOG_READONLY", // attempted to write a global catalog row
  "INTERNAL", // unexpected server error for this mutation only
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export interface MutationResult {
  mutationId: string;
  /** applied: changed the row. noop: valid, already merged (idempotent replay). rejected: refused and dead-lettered. */
  status: "applied" | "noop" | "rejected";
  reason?: RejectReason;
  message?: string;
}

/** Changed rows with version > request.cursor, by entity (tombstones included as rows with deletedAt set). */
export type SyncChanges = { [E in EntityName]: EntityTypeMap[E]["row"][] };

export interface SyncResponse {
  /** One entry per request mutation, same order. A rejected mutation never blocks the rest. */
  results: MutationResult[];
  changes: SyncChanges;
  /** PRs rebuilt for the series touched by this request (drives the "new PR" toast after sync). */
  newPrs: PersonalRecordRow[];
  /** Send this as `cursor` next time. When hasMore, it is the version of the last returned row. */
  cursor: number;
  /** true = more pages are waiting: call again immediately with `cursor` and no mutations. */
  hasMore: boolean;
  /**
   * true = request.cursor was older than the server's gcFloorVersion (tombstones were collected): `changes` is empty;
   * the client must wipe its local synced tables (keeping the outbox) and restart from cursor 0.
   */
  reset: boolean;
  serverTime: IsoDateTime;
  serverHlc: Hlc;
}

export function emptyChanges(): SyncChanges {
  return Object.fromEntries(ENTITY_NAMES.map((e) => [e, []])) as unknown as SyncChanges;
}

// ───────────────────────────── client engine (status for UI) ─────────────────────────────

export const SYNC_STATES = ["idle", "syncing", "offline", "error", "signed-out"] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export interface SyncStatus {
  state: SyncState;
  /** Outbox mutations not yet acknowledged by the server. */
  pendingCount: number;
  lastSyncedAt: IsoDateTime | null;
  lastError: string | null;
  /** Mutations the server rejected in the last sync (dead-lettered). */
  rejectedCount: number;
}

export const SYNC_REASONS = ["start", "online", "visibility", "write", "interval", "manual"] as const;
export type SyncReason = (typeof SYNC_REASONS)[number];

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  rejected: number;
  newPrs: PersonalRecordRow[];
  /** Set when ok is false. */
  error?: string;
  /** true when another sync was already running (navigator.locks) and this call did nothing. */
  skipped?: boolean;
}

/** Info passed to useOnSynced listeners after every completed sync that pulled or pushed something. */
export type SyncedInfo = Pick<SyncResult, "pushed" | "pulled" | "rejected" | "newPrs">;
