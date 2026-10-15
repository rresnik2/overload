import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { HLC_REGEX, SYNC_MAX_CLOCK_SKEW_MS } from "@/contracts/sync";
import { HLC_MAX_COUNTER, clampHlc, createHlcClock, formatHlc, maxHlc, parseHlc } from "./hlc";

describe("hlc format", () => {
  it("round-trips and matches the frozen regex", () => {
    const hlc = formatHlc({ wallMs: 1_791_990_000_000, counter: 10, nodeId: "3f9c1b2d" });
    expect(hlc).toBe("001791990000000-0000a-3f9c1b2d");
    expect(HLC_REGEX.test(hlc)).toBe(true);
    expect(parseHlc(hlc)).toEqual({ wallMs: 1_791_990_000_000, counter: 10, nodeId: "3f9c1b2d" });
    expect(parseHlc("nope")).toBeNull();
  });

  it("string order is causal order", () => {
    fc.assert(
      fc.property(
        fc.record({ wallMs: fc.nat(2_000_000_000_000), counter: fc.nat(HLC_MAX_COUNTER), nodeId: fc.constantFrom("a", "b1", "zz") }),
        fc.record({ wallMs: fc.nat(2_000_000_000_000), counter: fc.nat(HLC_MAX_COUNTER), nodeId: fc.constantFrom("a", "b1", "zz") }),
        (x, y) => {
          const cmp = x.wallMs - y.wallMs || x.counter - y.counter;
          if (cmp === 0) return true; // tie broken by nodeId
          return cmp < 0 === (formatHlc(x) < formatHlc(y));
        },
      ),
    );
  });

  it("carries counter overflow into the wall time", () => {
    expect(formatHlc({ wallMs: 5, counter: HLC_MAX_COUNTER + 1, nodeId: "n" })).toBe(formatHlc({ wallMs: 6, counter: 0, nodeId: "n" }));
  });

  it("maxHlc picks the greatest and treats empty as the lowest", () => {
    expect(maxHlc([])).toBe("");
    const lo = formatHlc({ wallMs: 1, counter: 0, nodeId: "a" });
    const hi = formatHlc({ wallMs: 2, counter: 0, nodeId: "a" });
    expect(maxHlc([lo, hi, ""])).toBe(hi);
  });
});

describe("hlc clock", () => {
  it("tick is strictly increasing even when wall time stalls or goes backwards", () => {
    let wall = 1_000_000;
    const clock = createHlcClock({ nodeId: "dev1", now: () => wall });
    const a = clock.tick();
    const b = clock.tick();
    wall -= 5000;
    const c = clock.tick();
    wall += 10_000;
    const d = clock.tick();
    expect([a, b, c, d]).toEqual([a, b, c, d].toSorted());
    expect(new Set([a, b, c, d]).size).toBe(4);
    for (const h of [a, b, c, d]) expect(HLC_REGEX.test(h)).toBe(true);
  });

  it("now() does not advance the clock", () => {
    const clock = createHlcClock({ nodeId: "dev1", now: () => 1_000_000 });
    const before = clock.last();
    clock.now();
    clock.now();
    expect(clock.last()).toBe(before);
    expect(clock.tick() > clock.now() || clock.tick() > before).toBe(true);
  });

  it("receive moves the clock past the remote HLC", () => {
    const clock = createHlcClock({ nodeId: "dev1", now: () => 1_000_000 });
    const remote = formatHlc({ wallMs: 1_000_000 + 60_000, counter: 7, nodeId: "dev2" });
    const merged = clock.receive(remote);
    expect(merged > remote).toBe(true);
    expect(clock.tick() > merged).toBe(true);
  });

  it("clamps a remote HLC more than the skew limit ahead of local time", () => {
    const now = 1_000_000;
    const clock = createHlcClock({ nodeId: "dev1", now: () => now });
    const far = formatHlc({ wallMs: now + 10 * SYNC_MAX_CLOCK_SKEW_MS, counter: 3, nodeId: "dev2" });
    const merged = clock.receive(far);
    expect(parseHlc(merged)?.wallMs).toBeLessThanOrEqual(now + SYNC_MAX_CLOCK_SKEW_MS);
    expect(parseHlc(clampHlc(far, now))?.wallMs).toBe(now + SYNC_MAX_CLOCK_SKEW_MS);
    expect(clampHlc(far, now)).toMatch(/-00003-dev2$/);
  });

  it("leaves in-range HLCs alone and resumes from a persisted value", () => {
    const hlc = formatHlc({ wallMs: 1_000_100, counter: 0, nodeId: "x" });
    expect(clampHlc(hlc, 1_000_000)).toBe(hlc);
    const clock = createHlcClock({ nodeId: "dev1", now: () => 1_000_000, initial: formatHlc({ wallMs: 2_000_000, counter: 4, nodeId: "dev1" }) });
    expect(clock.tick()).toBe(formatHlc({ wallMs: 2_000_000, counter: 5, nodeId: "dev1" }));
  });
});
