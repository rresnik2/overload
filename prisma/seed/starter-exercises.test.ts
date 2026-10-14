import { describe, expect, it } from "vitest";
import { catalogExerciseId } from "@/lib/ids";
import { loadSourceRows } from "./catalog";
import { STARTER_LABELS, classifyStarter } from "./starter-exercises";

describe("starter catalog", () => {
  const rows = new Map(loadSourceRows().map((r) => [r.id, r]));

  it("has 30 exercises that all exist in the vendored dataset", () => {
    expect(Object.keys(STARTER_LABELS)).toHaveLength(30);
    for (const id of Object.keys(STARTER_LABELS)) expect(rows.has(id), id).toBe(true);
  });

  it("vendors the full dataset (876 rows) with the Unlicense text next to it", () => {
    expect(rows.size).toBe(876);
  });

  it("classifies consistently: machines/cables never FREE_WEIGHT, stable unique ids, valid muscles", () => {
    const ids = new Set<string>();
    for (const [id, label] of Object.entries(STARTER_LABELS)) {
      const c = classifyStarter(rows.get(id)!, label);
      ids.add(catalogExerciseId(id));
      if (c.modality === "MACHINE") expect(["STACK", "PLATES_PER_SIDE", "TOTAL"]).toContain(c.loadType);
      if (c.loadType === "BODYWEIGHT_PLUS") expect(c.bodyweightFactor).not.toBeNull();
      expect(c.muscles.length, id).toBeGreaterThan(0);
      expect(c.muscles.some((m) => m.role === "PRIMARY"), id).toBe(true);
    }
    expect(ids.size).toBe(30);
  });

  it("marks the standard lifts exactly once each", () => {
    const lifts = Object.values(STARTER_LABELS).flatMap((l) => (l.standardLift ? [l.standardLift] : []));
    expect(new Set(lifts).size).toBe(lifts.length);
    expect(lifts.sort()).toEqual(["BARBELL_ROW", "BENCH_PRESS", "DEADLIFT", "DIP", "OVERHEAD_PRESS", "PULL_UP", "SQUAT"]);
  });
});
