import { describe, expect, it } from "vitest";
import { factsHash, stableStringify } from "./hash";
import { demoFacts } from "./test-support";

describe("factsHash", () => {
  it("ignores key order and is stable for the same facts", () => {
    expect(stableStringify({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":2,"y":1}]},"b":1}');
    const facts = demoFacts();
    const reordered = Object.fromEntries(Object.entries(facts).reverse());
    expect(factsHash(reordered)).toBe(factsHash(facts));
    expect(factsHash(facts)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when any fact changes", () => {
    const facts = demoFacts();
    expect(factsHash({ ...facts, training: { ...facts.training, hardSets: facts.training.hardSets + 1 } })).not.toBe(factsHash(facts));
  });
});
