import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createHlcClock, formatHlc, type HlcClock } from "./hlc";
import {
  emptyMergeState,
  mergeAll,
  mergeFields,
  rowHlc,
  valuesEqual,
  type FieldWrite,
  type MergeState,
} from "./merge";

const hlc = (wallMs: number, node = "a", counter = 0) => formatHlc({ wallMs, counter, nodeId: node });

describe("mergeFields", () => {
  it("takes the greater HLC per field and ignores older writes", () => {
    const s0 = emptyMergeState();
    const s1 = mergeFields(s0, { fields: { name: "A", reps: 5 }, fieldHlc: { name: hlc(10), reps: hlc(10) } }).state;
    const r = mergeFields(s1, { fields: { name: "old", reps: 8 }, fieldHlc: { name: hlc(5), reps: hlc(20) } });
    expect(r.state.values).toEqual({ name: "A", reps: 8 });
    expect(r.state.fieldHlc).toEqual({ name: hlc(10), reps: hlc(20) });
    expect(r.changed).toEqual(["reps"]);
  });

  it("is a no-op when replayed", () => {
    const write: FieldWrite = { fields: { name: "A" }, fieldHlc: { name: hlc(10) } };
    const once = mergeFields(emptyMergeState(), write);
    const twice = mergeFields(once.state, write);
    expect(twice.changed).toEqual([]);
    expect(twice.state).toEqual(once.state);
  });

  it("treats deletedAt as an ordinary field (undelete needs a later HLC)", () => {
    let s: MergeState = emptyMergeState();
    s = mergeFields(s, { fields: { name: "x" }, fieldHlc: { name: hlc(1) } }).state;
    s = mergeFields(s, { fields: { deletedAt: "2026-10-14T00:00:00.000Z" }, fieldHlc: { deletedAt: hlc(10) } }).state;
    s = mergeFields(s, { fields: { deletedAt: null }, fieldHlc: { deletedAt: hlc(5) } }).state; // stale undelete loses
    expect(s.values.deletedAt).toBe("2026-10-14T00:00:00.000Z");
    s = mergeFields(s, { fields: { deletedAt: null }, fieldHlc: { deletedAt: hlc(11) } }).state;
    expect(s.values.deletedAt).toBeNull();
  });

  it("an HLC advance with an equal value still counts as changed (other devices need the new HLC)", () => {
    const s = mergeFields(emptyMergeState(), { fields: { a: 1 }, fieldHlc: { a: hlc(1) } }).state;
    expect(mergeFields(s, { fields: { a: 1 }, fieldHlc: { a: hlc(2) } }).changed).toEqual(["a"]);
  });

  it('tie "incoming" adopts the server value for an equal HLC (rounded decimals); "keep" does not', () => {
    const s = mergeFields(emptyMergeState(), { fields: { w: 100.1234 }, fieldHlc: { w: hlc(1) } }).state;
    const write: FieldWrite = { fields: { w: 100.123 }, fieldHlc: { w: hlc(1) } };
    expect(mergeFields(s, write).state.values.w).toBe(100.1234);
    const adopted = mergeFields(s, write, { tie: "incoming" });
    expect(adopted.state.values.w).toBe(100.123);
    expect(adopted.changed).toEqual(["w"]);
  });

  it("ignores fields that have no HLC and computes the row HLC as the maximum", () => {
    const r = mergeFields(emptyMergeState(), { fields: { a: 1, b: 2 }, fieldHlc: { a: hlc(3) } });
    expect(r.state.values).toEqual({ a: 1 });
    expect(rowHlc({ a: hlc(3), b: hlc(9, "a", 2), c: hlc(9, "a", 1) })).toBe(hlc(9, "a", 2));
    expect(rowHlc({})).toBe("");
  });

  it("valuesEqual compares JSON values deeply", () => {
    expect(valuesEqual([{ a: 1, b: [2] }], [{ b: [2], a: 1 }])).toBe(true);
    expect(valuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(valuesEqual(null, undefined)).toBe(false);
  });
});

// ───────────────────────── convergence property tests ─────────────────────────

// `exerciseId` and `position` are the writable fields of an exerciseFavorite (with `deletedAt` for star/unstar), so the
// same properties cover two offline devices starring, unstarring and re-starring the same exercise.
const FIELDS = ["name", "reps", "weightKg", "notes", "deletedAt", "exerciseId", "position"] as const;
const valueFor = (field: string): fc.Arbitrary<unknown> =>
  field === "deletedAt"
    ? fc.constantFrom(null, "2026-10-14T00:00:00.000Z", "2026-10-15T00:00:00.000Z")
    : field === "reps"
      ? fc.integer({ min: 0, max: 30 })
      : field === "exerciseId"
        ? fc.constantFrom("83a024cb-efa6-5b1b-8cef-e115a267bd5b", "c48fba6b-6cc5-55c1-a5c6-33e149c64422")
        : field === "position"
          ? fc.constantFrom("a0", "a1", "Zz")
          : fc.constantFrom("a", "b", "c", null);

const fieldsArb: fc.Arbitrary<Record<string, unknown>> = fc
  .subarray([...FIELDS], { minLength: 1 })
  .chain((names) => fc.tuple(...names.map((n) => valueFor(n).map((v) => [n, v] as const))))
  .map((entries) => Object.fromEntries(entries));

function lww(writes: FieldWrite[]): MergeState {
  // Reference implementation: sort by HLC, apply in order (the last write per field wins).
  const events = writes.flatMap((w) => Object.keys(w.fields).map((f) => ({ f, v: w.fields[f], h: w.fieldHlc[f] as string })));
  events.sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0));
  const state: MergeState = emptyMergeState();
  for (const e of events) {
    state.values[e.f] = e.v;
    state.fieldHlc[e.f] = e.h;
  }
  return state;
}

const statesEqual = (a: MergeState, b: MergeState) => valuesEqual(a.values, b.values) && valuesEqual(a.fieldHlc, b.fieldHlc);

describe("merge convergence (property)", () => {
  const writeArb = fc
    .tuple(fieldsArb, fc.integer({ min: 1, max: 10_000 }), fc.constantFrom("devA", "devB", "devC"), fc.nat(40))
    .map(([fields, wall, node, counter]): FieldWrite => ({
      fields,
      fieldHlc: Object.fromEntries(Object.keys(fields).map((f) => [f, hlc(wall, node, counter)])),
    }));

  // Distinct writes need distinct HLCs (a node never reuses one); filter the generator accordingly.
  const uniqueWrites = fc.array(writeArb, { minLength: 1, maxLength: 12 }).filter((ws) => {
    const seen = new Set<string>();
    for (const w of ws) {
      const key = Object.values(w.fieldHlc)[0] as string;
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  });

  it("is commutative: any order gives the same state, equal to last-write-wins by HLC", () => {
    fc.assert(
      fc.property(uniqueWrites, fc.infiniteStream(fc.nat()), (writes, stream) => {
        const shuffled = [...writes];
        const it = stream[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (it.next().value as number) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j] as FieldWrite, shuffled[i] as FieldWrite];
        }
        const a = mergeAll(emptyMergeState(), writes).state;
        const b = mergeAll(emptyMergeState(), shuffled).state;
        expect(statesEqual(a, b)).toBe(true);
        expect(statesEqual(a, lww(writes))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("is idempotent: duplicates change nothing", () => {
    fc.assert(
      fc.property(uniqueWrites, (writes) => {
        const once = mergeAll(emptyMergeState(), writes).state;
        const dup = mergeAll(emptyMergeState(), [...writes, ...writes, ...writes]).state;
        expect(statesEqual(once, dup)).toBe(true);
        expect(mergeAll(once, writes).changed).toEqual([]);
      }),
      { numRuns: 300 },
    );
  });

  // Two simulated devices with their own HLC clocks (each with its own, possibly skewed or stalled, wall clock)
  // edit one row concurrently and exchange their mutation logs through a lossy, duplicating, reordering network.
  interface Step {
    kind: "edit" | "deliver";
    device: 0 | 1;
    fields: Record<string, unknown>;
    /** For deliver: which of the other device's logged mutations to send, in this order (duplicates allowed). */
    picks: number[];
    wallDelta: number;
  }
  const stepArb: fc.Arbitrary<Step> = fc.record({
    kind: fc.constantFrom<Step["kind"]>("edit", "edit", "deliver"),
    device: fc.constantFrom<0 | 1>(0, 1),
    fields: fieldsArb,
    picks: fc.array(fc.nat(30), { maxLength: 8 }),
    wallDelta: fc.integer({ min: -5, max: 50 }),
  });

  it("two devices converge under random edit interleavings and delivery orders", () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 1, maxLength: 40 }),
        fc.infiniteStream(fc.nat()),
        fc.tuple(fc.integer({ min: 1_000, max: 5_000 }), fc.integer({ min: 1_000, max: 5_000 })),
        (steps, stream, starts) => {
          const walls = [starts[0], starts[1]];
          const clocks: HlcClock[] = [0, 1].map((i) =>
            createHlcClock({ nodeId: i === 0 ? "devA" : "devB", now: () => walls[i] as number }),
          );
          const states: MergeState[] = [emptyMergeState(), emptyMergeState()];
          const logs: FieldWrite[][] = [[], []];

          const deliver = (to: 0 | 1, write: FieldWrite) => {
            const maxRemote = Object.values(write.fieldHlc).reduce((m, h) => (h > m ? h : m), "");
            clocks[to]?.receive(maxRemote);
            states[to] = mergeFields(states[to] as MergeState, write).state;
          };

          for (const step of steps) {
            const d = step.device;
            walls[d] = Math.max(1, (walls[d] as number) + step.wallDelta); // wall clocks may stall or step back
            if (step.kind === "edit") {
              const h = (clocks[d] as HlcClock).tick();
              const write: FieldWrite = { fields: step.fields, fieldHlc: Object.fromEntries(Object.keys(step.fields).map((f) => [f, h])) };
              states[d] = mergeFields(states[d] as MergeState, write).state;
              (logs[d] as FieldWrite[]).push(write);
            } else {
              const other = (d === 0 ? 1 : 0) as 0 | 1;
              const log = logs[other] as FieldWrite[];
              if (log.length > 0) for (const p of step.picks) deliver(d, log[p % log.length] as FieldWrite);
            }
          }

          // Final anti-entropy: every mutation reaches both devices, in a different random order, with duplicates.
          const it = stream[Symbol.iterator]();
          for (const to of [0, 1] as const) {
            const all = [...(logs[0] as FieldWrite[]), ...(logs[1] as FieldWrite[])];
            const order = all.map((w) => ({ w, k: it.next().value as number })).sort((x, y) => x.k - y.k).map((x) => x.w);
            for (const w of [...order, ...order.slice(0, 3)]) deliver(to, w);
          }

          expect(statesEqual(states[0] as MergeState, states[1] as MergeState)).toBe(true);
          expect(statesEqual(states[0] as MergeState, lww([...(logs[0] as FieldWrite[]), ...(logs[1] as FieldWrite[])]))).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});
