import { describe, expect, it } from "vitest";
import { nextTemplate, planLine } from "./next-up";

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
