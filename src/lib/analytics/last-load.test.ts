import { describe, expect, it } from "vitest";
import type { LocalDate } from "@/lib/dates";
import { lastLoadDay, lastLoadSet, lastLoadText, lastLoadWeight, type LastLoad } from "./last-load";

const d = (s: string) => s as LocalDate;
const load = (weightKg: number | null, reps: number | null, localDate = "2026-10-12"): LastLoad => ({ exerciseId: "e", localDate: d(localDate), weightKg, reps, pinStepKg: null, inputUnit: null });

describe("lastLoadSet", () => {
  it("says what was lifted in the exercise's own terms", () => {
    expect(lastLoadSet(load(110, 6), "TOTAL", "KG")).toBe("110 kg × 6");
    expect(lastLoadSet(load(30, 11), "PER_IMPLEMENT", "KG")).toBe("30 kg each × 11");
    expect(lastLoadSet(load(87.5, 8), "PLATES_PER_SIDE", "KG")).toBe("87.5 kg a side × 8");
    expect(lastLoadSet(load(45, 15), "STACK", "KG")).toBe("45 kg × 15");
    expect(lastLoadSet(load(27.5, 8), "BODYWEIGHT_PLUS", "KG")).toBe("BW + 27.5 kg × 8");
    expect(lastLoadSet(load(0, 12), "BODYWEIGHT_PLUS", "KG")).toBe("Bodyweight × 12");
    expect(lastLoadSet(load(null, 15), "NONE", "KG")).toBe("15 reps");
    expect(lastLoadSet(load(null, null), "NONE", "KG")).toBeNull();
  });

  it("converts to pounds and rounds to one decimal", () => {
    expect(lastLoadSet(load(100, 5), "TOTAL", "LB")).toBe("220.5 lb × 5");
    expect(lastLoadWeight(load(40.823, 1), "LB")).toBe(90);
  });
});

describe("lastLoadDay", () => {
  it("names today and yesterday, otherwise the short date", () => {
    expect(lastLoadDay(d("2026-10-16"), d("2026-10-16"))).toBe("today");
    expect(lastLoadDay(d("2026-10-15"), d("2026-10-16"))).toBe("yesterday");
    expect(lastLoadDay(d("2026-10-12"), d("2026-10-16"))).toBe("Mon 12 Oct");
    expect(lastLoadDay(d("2026-10-12"), null)).toBe("Mon 12 Oct");
  });
});

describe("lastLoadText", () => {
  it("joins the set and the day", () => {
    expect(lastLoadText(load(110, 6), "TOTAL", "KG", d("2026-10-16"))).toBe("110 kg × 6 · Mon 12 Oct");
    expect(lastLoadText(load(null, null), "NONE", "KG", d("2026-10-12"))).toBe("Logged today");
  });

  it("keeps the unit the set was entered in", () => {
    expect(lastLoadText({ ...load(40.823, 15), inputUnit: "LB" }, "STACK", "KG", d("2026-10-16"))).toBe("90 lb × 15 · Mon 12 Oct");
  });
});
