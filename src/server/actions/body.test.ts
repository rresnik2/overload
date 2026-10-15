import { describe, expect, it } from "vitest";
import { bodyMetricInputSchema } from "./body.logic";

const valid = { localDate: "2026-10-14", weightKg: 80 };

describe("body form schema", () => {
  it("accepts a measurement and fills the defaults", () => {
    const out = bodyMetricInputSchema.parse(valid);
    expect(out).toMatchObject({ localDate: "2026-10-14", weightKg: 80, bodyFatPct: null, bodyFatMethod: null, neckCm: null, notes: null });
  });

  it.each(["userId", "version", "hlc", "fieldHlc", "id", "measuredAt", "deletedAt", "effectiveLoadKg"])("rejects an injected %s", (key) => {
    const result = bodyMetricInputSchema.safeParse({ ...valid, [key]: key === "userId" ? "someone-else" : "x" });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range values", () => {
    expect(bodyMetricInputSchema.safeParse({ ...valid, weightKg: 5 }).success).toBe(false);
    expect(bodyMetricInputSchema.safeParse({ ...valid, bodyFatPct: 90 }).success).toBe(false);
    expect(bodyMetricInputSchema.safeParse({ ...valid, localDate: "14/10/2026" }).success).toBe(false);
  });

  it("does not declare userId in its shape", () => {
    expect(Object.keys(bodyMetricInputSchema.shape)).not.toContain("userId");
  });
});
