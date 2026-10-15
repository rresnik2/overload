import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTICLES } from "@/components/learn/articles";
import { GLOSSARY, GLOSSARY_MAX_LENGTH, TERM_IDS } from "./glossary";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "generated" ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== "glossary.ts" ? [p] : [];
  });
}

const sources = sourceFiles(path.join(process.cwd(), "src")).map((p) => fs.readFileSync(p, "utf8"));
/** `<InfoHint term="rir"`, `<Term id="rir"` and `hint: "rir"` style literals: every id the UI uses. */
const USED = new Set(
  sources.flatMap((s) => [...s.matchAll(/<(?:InfoHint|Term)\b[^>]*?\b(?:term|id)=["']([A-Za-z0-9]+)["']/g)].map((m) => m[1]!)),
);

describe("glossary", () => {
  it("has an entry for every id and a heading and explanation on each", () => {
    expect(TERM_IDS.length).toBeGreaterThan(50);
    for (const id of TERM_IDS) {
      const e = GLOSSARY[id];
      expect(e.term.trim(), id).not.toBe("");
      expect(e.short.trim(), id).not.toBe("");
    }
  });

  it("keeps every explanation short: at most 200 characters and two sentences", () => {
    for (const id of TERM_IDS) {
      const { short } = GLOSSARY[id];
      expect(short.length, `${id} is ${short.length} characters`).toBeLessThanOrEqual(GLOSSARY_MAX_LENGTH);
      // Sentence ends: . ! ? followed by a space and a capital (so "0.5" and "e.g." do not count).
      const sentences = short.split(/(?<=[.!?])\s+(?=[A-Z"])/);
      expect(sentences.length, `${id} has ${sentences.length} sentences`).toBeLessThanOrEqual(2);
      expect(short, id).not.toMatch(/\s{2,}/);
    }
  });

  it("only links to /learn articles that exist", () => {
    const slugs = new Set([...ARTICLES.map((a) => a.slug)]);
    for (const id of TERM_IDS) {
      const learn = GLOSSARY[id].learn;
      if (learn) expect(slugs.has(learn), `${id} -> ${learn}`).toBe(true);
    }
  });

  it("covers every term id the UI uses, and the UI uses none that are missing", () => {
    expect(USED.size).toBeGreaterThan(0);
    for (const id of USED) expect(TERM_IDS as string[], `UI uses unknown term "${id}"`).toContain(id);
  });

  it("has no unused entries (every glossary term appears in the UI)", () => {
    const unused = TERM_IDS.filter((id) => !USED.has(id) && !sources.some((s) => new RegExp(`["']${id}["']`).test(s)));
    expect(unused).toEqual([]);
  });

  it("covers the vocabulary the owner listed", () => {
    const required = [
      "rir", "rpe", "targetRir", "failure", "hardSet", "proximityToFailure",
      "warmupSet", "workingSet", "dropSet", "amrap", "superset", "topSet", "restTimer",
      "loadTotal", "loadPerHand", "loadPerSide", "loadStack", "bodyweightPlus", "assisted", "machineWeights", "machineProfile",
      "e1rm", "forecast", "forecastBands", "forecastNeedsSessions", "volumeLoad", "weeklySets", "fractionalSets", "targetBand",
      "personalRecord", "prE1rm", "prMaxLoad", "prRepMax", "prMaxReps", "prSetVolume", "prSessionVolume", "deload", "stall", "doubleProgression",
      "bodyweightTrend", "bodyFatMethods", "navyTape", "ffmi", "dots",
      "modalityTabs", "favorites", "syncStatus", "units", "effortScale", "e1rmFormula", "trainingGoal", "experienceLevel",
      "goalHypertrophy", "goalStrength", "goalGeneral", "goalFatLoss", "rateOfLoss",
    ];
    for (const id of required) expect(TERM_IDS as string[], id).toContain(id);
  });
});
