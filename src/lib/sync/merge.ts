// Per-field last-write-wins merge by HLC (pure; shared by the client and the server).
//
// A row is `{ values, fieldHlc }`. A write is `{ fields, fieldHlc }` (one HLC per field). Merging is
//   * commutative:  merge(merge(s, a), b) == merge(merge(s, b), a)
//   * idempotent:   merge(merge(s, a), a) == merge(s, a)
// because each field independently keeps the value with the greatest HLC (a missing HLC is "", the lowest).
// HLCs embed the writer's node id, so two different writes never tie; an equal HLC means the SAME write replayed
// (`tie: "keep"`), except when the server's stored value was rounded to its column precision (`tie: "incoming"`
// lets the client adopt the server's value for a pulled row). `deletedAt` is an ordinary field: delete is
// `deletedAt = <iso>`, undelete is `deletedAt = null` with a later HLC.
import type { Hlc } from "@/contracts/sync";
import { maxHlc } from "./hlc";

export type FieldValues = Record<string, unknown>;
export type FieldHlcs = Record<string, Hlc>;

export interface MergeState {
  values: FieldValues;
  fieldHlc: FieldHlcs;
}

export interface FieldWrite {
  fields: FieldValues;
  fieldHlc: FieldHlcs;
}

export interface MergeOptions {
  /** What an equal-HLC write does. "keep" (default): nothing (replay). "incoming": adopt it (server rows win ties on the client). */
  tie?: "keep" | "incoming";
}

export interface MergeResult {
  state: MergeState;
  /** Fields whose HLC advanced (or, with tie "incoming", whose value was replaced). Empty = the write was a no-op. */
  changed: string[];
}

export function emptyMergeState(): MergeState {
  return { values: {}, fieldHlc: {} };
}

/** Deep equality for JSON values (key order independent). */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => valuesEqual(v, b[i]));
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  return ka.length === kb.length && ka.every((k) => k in (b as object) && valuesEqual((a as FieldValues)[k], (b as FieldValues)[k]));
}

/** Merge one write into a row state. Pure: returns a new state. */
export function mergeFields(state: MergeState, write: FieldWrite, options: MergeOptions = {}): MergeResult {
  const tie = options.tie ?? "keep";
  const values: FieldValues = { ...state.values };
  const fieldHlc: FieldHlcs = { ...state.fieldHlc };
  const changed: string[] = [];

  for (const field of Object.keys(write.fields)) {
    const incoming = write.fieldHlc[field];
    if (incoming === undefined) continue; // a field without an HLC is not a write
    const current = fieldHlc[field] ?? "";
    if (incoming > current) {
      values[field] = write.fields[field];
      fieldHlc[field] = incoming;
      changed.push(field);
    } else if (incoming === current && tie === "incoming" && !valuesEqual(values[field], write.fields[field])) {
      values[field] = write.fields[field];
      changed.push(field);
    }
  }
  return { state: { values, fieldHlc }, changed };
}

/** Fold many writes (any order, duplicates allowed) into a state. */
export function mergeAll(state: MergeState, writes: Iterable<FieldWrite>, options: MergeOptions = {}): MergeResult {
  let current = state;
  const changed = new Set<string>();
  for (const write of writes) {
    const result = mergeFields(current, write, options);
    current = result.state;
    for (const f of result.changed) changed.add(f);
  }
  return { state: current, changed: [...changed] };
}

/** The row-level HLC: the greatest field HLC. */
export function rowHlc(fieldHlc: FieldHlcs): Hlc {
  return maxHlc(Object.values(fieldHlc));
}

/** Canonical (sorted-key) form of a state, for equality assertions. */
export function canonicalState(state: MergeState): string {
  const sortKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return JSON.stringify({ values: sortKeys(state.values), fieldHlc: sortKeys(state.fieldHlc) });
}
