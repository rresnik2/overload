import { describe, expect, it } from "vitest";
import { replaceEqualDeep } from "./structural";

describe("replaceEqualDeep", () => {
  it("returns the previous reference for deeply equal values", () => {
    const prev = { a: [1, { b: 2 }], m: new Map([["k", { x: 1 }]]), n: null };
    const next = { a: [1, { b: 2 }], m: new Map([["k", { x: 1 }]]), n: null };
    expect(replaceEqualDeep(prev, next)).toBe(prev);
  });

  it("keeps unchanged branches and replaces only what changed", () => {
    const prev = { keep: { v: 1 }, change: { v: 1 }, list: [{ id: 1 }, { id: 2 }] };
    const next = { keep: { v: 1 }, change: { v: 2 }, list: [{ id: 1 }, { id: 2 }] };
    const out = replaceEqualDeep(prev, next);
    expect(out).not.toBe(prev);
    expect(out.keep).toBe(prev.keep);
    expect(out.list).toBe(prev.list);
    expect(out.change).toEqual({ v: 2 });
  });

  it("shares array items and Map values individually", () => {
    const prev = [{ id: "a", n: 1 }, { id: "b", n: 1 }];
    const out = replaceEqualDeep(prev, [{ id: "a", n: 1 }, { id: "b", n: 2 }]);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).toEqual({ id: "b", n: 2 });
    const pm = new Map([["x", [1]], ["y", [2]]]);
    const om = replaceEqualDeep(pm, new Map([["x", [1]], ["y", [3]]]));
    expect(om.get("x")).toBe(pm.get("x"));
    expect(om.get("y")).toEqual([3]);
  });

  it("notices added and removed items and keys", () => {
    expect(replaceEqualDeep([1], [1, 2])).toEqual([1, 2]);
    expect(replaceEqualDeep({ a: 1 }, { a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(replaceEqualDeep({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
    expect(replaceEqualDeep(new Map([["a", 1]]), new Map())).toEqual(new Map());
  });

  it("compares non-plain values by identity and handles first-time input", () => {
    const d = new Date(0);
    expect(replaceEqualDeep({ d }, { d: new Date(0) }).d).not.toBe(d);
    expect(replaceEqualDeep(undefined, { a: 1 })).toEqual({ a: 1 });
  });
});
