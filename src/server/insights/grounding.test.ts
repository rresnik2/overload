import { describe, expect, it } from "vitest";
import type { InsightNarrative } from "@/contracts/insights";
import { checkNarrative, extractNumbers, numbersInFacts, toneViolations, ungroundedNumbers, unknownFactRefs } from "./grounding";
import { demoFacts, groundedNarrative } from "./test-support";

const facts = demoFacts();
const narrativeWith = (over: Partial<InsightNarrative>): InsightNarrative => ({ ...groundedNarrative(facts), ...over });

describe("extractNumbers", () => {
  it("reads formatted quantities", () => {
    expect(extractNumbers("Squat e1RM 1,200 kg, then 82.40 kg and 10-20 sets")).toEqual(["1200", "82.4", "10", "20"]);
  });
  it("splits dates into year, month and day and ignores the 1 in e1RM", () => {
    expect(extractNumbers("Week of 2026-10-05: e1RM and 1RM held")).toEqual(["2026", "10", "5"]);
  });
  it("ignores signs", () => {
    expect(extractNumbers("down -1.2 kg")).toEqual(["1.2"]);
  });
});

describe("numeric grounding", () => {
  it("accepts a narrative whose numbers all come from the facts", () => {
    expect(ungroundedNumbers(groundedNarrative(facts), facts)).toEqual([]);
    expect(checkNarrative(groundedNarrative(facts), facts)).toBeNull();
  });
  it("accepts facts values in any formatting (1,200 / 82.4 kg)", () => {
    const bw = facts.lifter.bodyweightKg!;
    const n = narrativeWith({ summary: `Bodyweight is ${bw.toFixed(1)} kg and ${facts.training.hardSets} hard sets.` });
    expect(ungroundedNumbers(n, facts)).toEqual([]);
    expect(numbersInFacts(facts).has(String(bw))).toBe(true);
  });
  it("rejects an invented number", () => {
    const n = narrativeWith({ summary: "You squatted 317.5 kg this week." });
    expect(ungroundedNumbers(n, facts)).toContain("317.5");
    expect(checkNarrative(n, facts)?.ungroundedNumbers).toContain("317.5");
  });
  it("rejects numbers hidden in section and action text", () => {
    const n = narrativeWith({
      sections: [{ title: "Volume", body: "That is 999 sets.", factRefs: ["training"] }],
      actions: [{ text: "Add 777 kg.", factRefs: [] }],
    });
    expect(ungroundedNumbers(n, facts)).toEqual(["999", "777"]);
  });
});

describe("factRefs", () => {
  it("flags ids that are not in the facts", () => {
    const n = narrativeWith({ sections: [{ title: "x", body: "y", factRefs: ["training", "lift:made-up"] }] });
    expect(unknownFactRefs(n, facts)).toEqual(["lift:made-up"]);
    expect(unknownFactRefs(groundedNarrative(facts), facts)).toEqual([]);
  });
});

describe("tone", () => {
  it("rejects medical and loaded body-composition wording but allows body fat", () => {
    expect(toneViolations(narrativeWith({ summary: "Your body fat percentage is stable." }))).toEqual([]);
    expect(toneViolations(narrativeWith({ summary: "Consider medication or a diagnosis." }))).toEqual(["medication", "diagnosis"]);
    expect(toneViolations(narrativeWith({ summary: "You are overweight and fat." }))).toEqual(["overweight", "fat"]);
  });
});
