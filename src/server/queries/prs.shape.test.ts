import { describe, expect, it } from "vitest";
import { generateLifterRows } from "@/lib/fixtures/generate";
import { computeSeriesPrs } from "@/lib/sync/prs";
import type { PersonalRecordRow } from "@/contracts/entities";
import { buildPrBoard } from "./prs.shape";

const rows = generateLifterRows();
const { input } = rows;
const planted = rows.planted!;

function prRows(): { rows: PersonalRecordRow[]; dates: Map<string, string> } {
  const out: PersonalRecordRow[] = [];
  const dates = new Map<string, string>();
  for (const key of new Set(input.sets.map((s) => s.seriesKey))) {
    const sets = input.sets.filter((s) => s.seriesKey === key).map((s) => ({
      id: s.id, workoutId: s.workoutId, exerciseId: s.exerciseId, machineProfileId: s.machineProfileId, seriesKey: s.seriesKey,
      setType: s.setType, completedAt: s.completedAt, reps: s.reps, effectiveLoadKg: s.effectiveLoadKg, e1rmKg: s.e1rmKg,
    }));
    for (const s of input.sets) dates.set(s.workoutId, s.localDate);
    for (const c of computeSeriesPrs(sets)) {
      out.push({ id: `${c.seriesKey}:${c.type}:${c.reps}`, exerciseId: c.exerciseId, machineProfileId: c.machineProfileId, seriesKey: c.seriesKey, type: c.type, reps: c.reps, value: c.value, previousValue: null, setId: c.setId, workoutId: c.workoutId, achievedAt: c.achievedAt });
    }
  }
  return { rows: out, dates };
}

describe("PR board", () => {
  const { rows: pr, dates } = prRows();
  const board = buildPrBoard({ rows: pr, exercises: input.exercises, machineProfiles: input.machineProfiles, workoutDates: dates });

  it("one block per series; the two leg presses are separate and labelled by machine", () => {
    const legs = board.series.filter((s) => s.exerciseName === "Leg Press");
    expect(legs.map((l) => l.seriesKey).sort()).toEqual([planted.legPress.gymA.seriesKey, planted.legPress.gymB.seriesKey].sort());
    expect(new Set(legs.map((l) => l.seriesLabel)).size).toBe(2);
    expect(legs.every((l) => l.modality === "MACHINE")).toBe(true);
  });

  it("orders records E1RM first and uses the workout's localDate", () => {
    const squat = board.series.find((s) => s.seriesKey === planted.squatProgressing.seriesKey)!;
    expect(squat.records[0]!.type).toBe("E1RM");
    expect(squat.records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.localDate))).toBe(true);
  });

  it("recent records only list improvements (a first record has no previous value)", () => {
    expect(board.recent).toEqual([]);
    const improved = pr.map((r, i) => (i === 0 ? { ...r, previousValue: r.value - 5 } : r));
    expect(buildPrBoard({ rows: improved, exercises: input.exercises, machineProfiles: input.machineProfiles, workoutDates: dates }).recent).toHaveLength(1);
  });

  it("contains no userId", () => {
    expect(JSON.stringify(board)).not.toContain("userId");
  });
});
