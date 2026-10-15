import { describe, expect, it, vi } from "vitest";
import { FIXTURE_EXERCISES } from "@/lib/fixtures/exercises";
import { makeInput, makeProfile, sessionsOf } from "@/lib/fixtures/factories";

// The standards registry is empty (no norms are invented), so the card path is exercised with a stubbed lookup.
vi.mock("../standards", () => ({
  strengthPercentile: vi.fn((input: { standardLift: string }) =>
    input.standardLift === "SQUAT" ? { percentile: 62, population: "Mock lifters, male, 85 kg bodyweight", source: "mock" } : null,
  ),
}));

import { INSIGHT_RULES } from "./rules";

const squat = FIXTURE_EXERCISES.squat.meta;
const bench = FIXTURE_EXERCISES.bench.meta;
const legPress = FIXTURE_EXERCISES.legPress.meta;
const bodyMetrics = [{ localDate: "2026-10-05", weightKg: 85, bodyFatPct: null, bodyFatMethod: null, neckCm: null, waistCm: null, hipCm: null, chestCm: null, armCm: null, thighCm: null, calfCm: null }];

describe("7. relative-strength-percentile (with norms available)", () => {
  it("names the comparison population and only covers barbell standard lifts", () => {
    const sets = [...sessionsOf(squat.id, 8, () => 140), ...sessionsOf(bench.id, 8, () => 100), ...sessionsOf(legPress.id, 8, () => 300, { machineProfileId: "m1" })];
    const cards = INSIGHT_RULES["relative-strength-percentile"](makeInput({ today: "2026-10-12", sets, bodyMetrics }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: `insight:relative-strength-percentile:${squat.id}`, severity: "info", subject: { exerciseId: squat.id } });
    expect(cards[0]!.body).toContain("Mock lifters, male, 85 kg bodyweight");
    expect(cards[0]!.evidence.find((e) => e.label === "Population")?.value).toBe("Mock lifters, male, 85 kg bodyweight");
    expect(cards[0]!.citations).toEqual(["strengthlevel", "jaric2002"]);
  });
  it("skips lifts not trained in the last 8 weeks and deload-only history", () => {
    const old = sessionsOf(squat.id, 8, () => 140, { endDate: "2026-06-01" });
    expect(INSIGHT_RULES["relative-strength-percentile"](makeInput({ today: "2026-10-12", sets: old, bodyMetrics }))).toEqual([]);
    const deload = sessionsOf(squat.id, 8, () => 140, { deload: () => true });
    expect(INSIGHT_RULES["relative-strength-percentile"](makeInput({ today: "2026-10-12", sets: deload, bodyMetrics }))).toEqual([]);
    expect(INSIGHT_RULES["relative-strength-percentile"](makeInput({ today: "2026-10-12", profile: makeProfile({ sex: "PREFER_NOT_TO_SAY" }), sets: sessionsOf(squat.id, 8, () => 140), bodyMetrics }))).toEqual([]);
  });
});
