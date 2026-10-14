import { describe, expect, it } from "vitest";
import {
  defaultIncrement,
  displayUnit,
  formatNumber,
  formatWeight,
  fromKg,
  kgToLb,
  lbToKg,
  parseNumber,
  rirToRpe,
  round,
  roundToStep,
  rpeToRir,
  toKg,
} from "./units";

describe("units", () => {
  it("converts lb <-> kg with the exact factor", () => {
    expect(lbToKg(100)).toBe(45.359);
    expect(kgToLb(45.359237)).toBeCloseTo(100, 6);
  });

  it("round-trips pound entries to exactly what was typed", () => {
    for (const lb of [45, 95, 135, 185, 225, 315, 2.5, 52.5, 100.5]) {
      expect(fromKg(toKg(lb, "LB"), "LB")).toBe(lb);
    }
  });

  it("keeps kg entries unchanged", () => {
    for (const kg of [20, 62.5, 100, 142.5, 0.25]) {
      expect(fromKg(toKg(kg, "KG"), "KG")).toBe(kg);
    }
  });

  it("formats weights without trailing zeros", () => {
    expect(formatWeight(61.235, "LB")).toBe("135 lb");
    expect(formatWeight(62.5, "KG")).toBe("62.5 kg");
    expect(formatWeight(62.5, "KG", { withUnit: false })).toBe("62.5");
    expect(formatNumber(2)).toBe("2");
  });

  it("round / roundToStep", () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(roundToStep(61, 2.5)).toBe(60);
    expect(roundToStep(61.3, 2.5)).toBe(62.5);
    expect(roundToStep(5, 0)).toBe(5);
  });

  it("parses user input including decimal commas", () => {
    expect(parseNumber("62,5")).toBe(62.5);
    expect(parseNumber(" 135 ")).toBe(135);
    expect(parseNumber("1 000.5")).toBe(1000.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("12kg")).toBeNull();
  });

  it("RIR <-> RPE", () => {
    expect(rirToRpe(2)).toBe(8);
    expect(rpeToRir(8.5)).toBe(1.5);
  });

  it("displayUnit prefers the unit the set was typed in", () => {
    expect(displayUnit("LB", "KG")).toBe("LB");
    expect(displayUnit(null, "KG")).toBe("KG");
    expect(displayUnit(undefined, "LB")).toBe("LB");
  });

  it("defaultIncrement uses pin step for machines, equipment table otherwise", () => {
    expect(defaultIncrement("KG", "BARBELL")).toBe(2.5);
    expect(defaultIncrement("LB", "BARBELL")).toBe(5);
    expect(defaultIncrement("KG", "MACHINE_SELECTORIZED", { pinStepKg: 4.5 })).toBe(4.5);
    expect(defaultIncrement("LB", "SOMETHING_ELSE")).toBe(5);
  });
});
