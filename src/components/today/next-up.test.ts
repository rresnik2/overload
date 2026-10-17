import { describe, expect, it } from "vitest";
import { donePlanLine, nextFromHistory, nextTemplate, planLine, topSet } from "./next-up";

const T = [
  { id: "push", position: "a0" },
  { id: "pull", position: "a1" },
  { id: "legs", position: "a2" },
];
const w = (templateId: string | null, startedAt: string) => ({ templateId, startedAt });

describe("nextTemplate", () => {
  it("is the first template when nothing was started from one", () => {
    expect(nextTemplate(T, [])?.id).toBe("push");
    expect(nextTemplate(T, [w(null, "2026-10-01T10:00:00Z")])?.id).toBe("push");
  });
  it("is the one after the most recently started, wrapping round", () => {
    expect(nextTemplate(T, [w("push", "2026-10-01T10:00:00Z")])?.id).toBe("pull");
    expect(nextTemplate(T, [w("push", "2026-10-01T10:00:00Z"), w("pull", "2026-10-03T10:00:00Z")])?.id).toBe("legs");
    expect(nextTemplate(T, [w("legs", "2026-10-05T10:00:00Z"), w("pull", "2026-10-03T10:00:00Z")])?.id).toBe("push");
  });
  it("orders by position, not by list order, and ignores deleted templates", () => {
    expect(nextTemplate([T[2]!, T[0]!, T[1]!], [])?.id).toBe("push");
    expect(nextTemplate(T, [w("gone", "2026-10-05T10:00:00Z")])?.id).toBe("push");
  });
  it("is null without templates", () => {
    expect(nextTemplate([], [])).toBeNull();
  });
});

describe("planLine", () => {
  it("writes sets by reps, with a range and a fallback", () => {
    expect(planLine({ workingSets: 4, repMin: 5, repMax: 5 })).toBe("4 × 5");
    expect(planLine({ workingSets: 3, repMin: 8, repMax: 10 })).toBe("3 × 8–10");
    expect(planLine({ workingSets: 3, repMin: 6, repMax: null })).toBe("3 × 6");
    expect(planLine({ workingSets: 1, repMin: null, repMax: null })).toBe("1 set");
    expect(planLine({ workingSets: 3, repMin: null, repMax: null })).toBe("3 sets");
  });
});

describe("nextFromHistory", () => {
  const h = (title: string | null, startedAt: string, endedAt: string | null = startedAt) => ({ title, startedAt, endedAt });
  const week = [h("Upper A", "2026-10-12T17:00:00Z"), h("Lower A", "2026-10-13T17:00:00Z"), h("Upper B", "2026-10-15T17:00:00Z"), h("Lower B", "2026-10-16T17:00:00Z")];

  it("repeats the session done least recently, so the rotation advances", () => {
    expect(nextFromHistory(week)?.title).toBe("Upper A");
    expect(nextFromHistory([...week, h("Upper A", "2026-10-19T17:00:00Z")])?.title).toBe("Lower A");
  });
  it("returns that name's latest workout", () => {
    const older = h("Upper A", "2026-10-05T17:00:00Z");
    expect(nextFromHistory([older, ...week])?.startedAt).toBe("2026-10-12T17:00:00Z");
  });
  it("ignores unfinished and unnamed workouts, and the default title", () => {
    expect(nextFromHistory([h("Push", "2026-10-01T10:00:00Z"), h("Pull", "2026-10-02T10:00:00Z", null), h(null, "2026-10-03T10:00:00Z"), h("Workout", "2026-10-04T10:00:00Z")])?.title).toBe("Push");
    expect(nextFromHistory([h(null, "2026-10-03T10:00:00Z")])).toBeNull();
    expect(nextFromHistory([])).toBeNull();
  });
});

describe("donePlanLine and topSet", () => {
  const s = (weightKg: number | null, reps: number | null, setType: "WORKING" | "WARMUP" = "WORKING", done = true) => ({ weightKg, reps, setType, completedAt: done ? "2026-10-12T17:00:00Z" : null });
  it("describes the completed working sets", () => {
    expect(donePlanLine([s(60, 8, "WARMUP"), s(110, 6), s(110, 5), s(110, 5)])).toBe("3 × 5–6");
    expect(donePlanLine([s(110, 6, "WORKING", false)])).toBeNull();
  });
  it("finds the heaviest completed working set, most reps on a tie", () => {
    expect(topSet([s(140, 1, "WARMUP"), s(110, 5), s(110, 6), s(150, 5, "WORKING", false)])).toMatchObject({ weightKg: 110, reps: 6 });
    expect(topSet([])).toBeNull();
  });
});
