import { describe, expect, it } from "vitest";
import {
  CATALOG_NAMESPACE,
  catalogExerciseId,
  isUuid,
  isUuidV7,
  newId,
  parseSeriesKey,
  seriesKey,
  slugify,
} from "./ids";

// Cross-checked against Python's uuid.uuid5 (an independent implementation).
const PINNED_BARBELL_SQUAT = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";

describe("ids", () => {
  it("generates time-ordered UUIDv7 ids", () => {
    const a = newId();
    expect(isUuid(a)).toBe(true);
    expect(isUuidV7(a)).toBe(true);
    expect(newId()).not.toBe(a);
  });

  it("derives stable catalog ids (namespace is frozen)", () => {
    // If this test fails the catalog namespace changed: that re-keys every catalog exercise. Do not "fix" the literals.
    expect(CATALOG_NAMESPACE).toBe("c48fba6b-6cc5-55c1-a5c6-33e149c64422");
    expect(catalogExerciseId("Barbell_Squat")).toBe(PINNED_BARBELL_SQUAT);
    expect(catalogExerciseId("Barbell_Squat")).not.toBe(catalogExerciseId("Barbell_Bench_Press_-_Medium_Grip"));
    expect(isUuid(catalogExerciseId("Barbell_Squat"))).toBe(true);
    expect(() => catalogExerciseId("")).toThrow();
  });

  it("builds and parses series keys", () => {
    expect(seriesKey("ex1")).toBe("ex1");
    expect(seriesKey("ex1", null)).toBe("ex1");
    expect(seriesKey("ex1", "mp1")).toBe("ex1:mp1");
    expect(parseSeriesKey("ex1")).toEqual({ exerciseId: "ex1", machineProfileId: null });
    expect(parseSeriesKey("ex1:mp1")).toEqual({ exerciseId: "ex1", machineProfileId: "mp1" });
  });

  it("slugifies names", () => {
    expect(slugify("Barbell Back Squat")).toBe("barbell-back-squat");
    expect(slugify("  Câble Fly & Press! ")).toBe("cable-fly-and-press");
  });
});
