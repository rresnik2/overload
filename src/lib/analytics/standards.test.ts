import { describe, expect, it } from "vitest";
import { levelsAt, percentileFromLevels, strengthPercentile, strengthPercentileFrom, STANDARDS_REGISTRY, type StandardsRegistry, type StandardsTable } from "./standards";

const table: StandardsTable = {
  source: "Test source",
  populationName: "Test lifters",
  percentiles: [5, 20, 50, 80, 95],
  rows: [
    { bodyweightKg: 60, levelsKg: [40, 60, 80, 100, 120] },
    { bodyweightKg: 80, levelsKg: [60, 80, 100, 120, 140] },
  ],
};
const registry: StandardsRegistry = { BENCH_PRESS: { MALE: table } };
const base = { standardLift: "BENCH_PRESS" as const, e1rmKg: 100, bodyweightKg: 70, sex: "MALE" as const, ageYears: 30 };

describe("strengthPercentile", () => {
  it("returns null until a table is registered (no norms are invented)", () => {
    expect(Object.keys(STANDARDS_REGISTRY)).toHaveLength(0);
    expect(strengthPercentile(base)).toBeNull();
  });
});

describe("lookup mechanics (injected table)", () => {
  it("interpolates bodyweight and percentile and names the population", () => {
    // at 70 kg the levels are [50, 70, 90, 110, 130]; 100 is half way between 50% (90) and 80% (110) -> 65
    expect(strengthPercentileFrom(registry, base)).toEqual({ percentile: 65, population: "Test lifters, male, 70 kg bodyweight", source: "Test source" });
  });
  it("is null for machines-like unknowns: unknown sex, PREFER_NOT_TO_SAY, missing table, out-of-range bodyweight, bad numbers", () => {
    expect(strengthPercentileFrom(registry, { ...base, sex: "PREFER_NOT_TO_SAY" })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, sex: "FEMALE" })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, standardLift: "SQUAT" })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, bodyweightKg: 40 })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, bodyweightKg: 120 })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, e1rmKg: 0 })).toBeNull();
    expect(strengthPercentileFrom(registry, { ...base, bodyweightKg: 0 })).toBeNull();
  });
  it("levelsAt handles exact rows and empty tables", () => {
    expect(levelsAt(table, 60)).toEqual([40, 60, 80, 100, 120]);
    expect(levelsAt(table, 80)).toEqual([60, 80, 100, 120, 140]);
    expect(levelsAt({ ...table, rows: [] }, 70)).toBeNull();
  });
  it("percentileFromLevels scales below the first level and tapers above the last, within 1-99", () => {
    const levels = [50, 70, 90, 110, 130];
    const p = [5, 20, 50, 80, 95];
    expect(percentileFromLevels(p, levels, 25)).toBe(3);
    expect(percentileFromLevels(p, levels, 1)).toBe(1);
    expect(percentileFromLevels(p, levels, 50)).toBe(3 + 2);
    expect(percentileFromLevels(p, levels, 130)).toBe(95);
    expect(percentileFromLevels(p, levels, 400)).toBe(99);
    expect(percentileFromLevels(p, levels, 90)).toBe(50);
  });
});
