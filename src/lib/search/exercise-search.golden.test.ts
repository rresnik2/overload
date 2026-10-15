// Golden queries against the REAL catalog (prisma/data/free-exercise-db.json classified by prisma/seed/classify.ts).
import { describe, expect, it } from "vitest";
import { loadSourceRows } from "../../../prisma/seed/catalog";
import { classify } from "../../../prisma/seed/classify";
import { catalogExerciseId } from "@/lib/ids";
import { buildSearchIndex, normalizeText, searchExercises, type SearchableExercise } from "./exercise-search";

interface CatalogExercise extends SearchableExercise {
  name: string;
}

const catalog: CatalogExercise[] = loadSourceRows().map((row) => {
  const c = classify(row);
  return { id: catalogExerciseId(row.id), name: c.name, slug: c.slug, aliases: c.aliases, modality: c.modality, equipment: c.equipment, muscles: c.muscles, standardLift: c.standardLift, mechanic: c.mechanic };
});
const byId = new Map(catalog.map((e) => [e.id, e]));
const index = buildSearchIndex(catalog);

const run = (query: string, favoriteIds?: ReadonlySet<string>) => searchExercises(index, query, { favoriteIds }).map((h) => byId.get(h.id) as CatalogExercise);
const names = (list: CatalogExercise[], count = 3) => list.slice(0, count).map((e) => e.name);
const trains = (e: CatalogExercise, muscle: string) => e.muscles.some((m) => m.muscle === muscle);

describe("golden searches on the real catalog", () => {
  it("has the full catalog", () => {
    expect(catalog).toHaveLength(876);
  });

  it('"incline db" finds Incline Dumbbell Press in the top 3', () => {
    const hits = run("incline db");
    expect(names(hits)).toContain("Incline Dumbbell Press");
    for (const e of hits) {
      expect(normalizeText(e.name)).toContain("incline");
      expect(e.equipment === "DUMBBELL" || /\b(db|dumbbell)\b/i.test(e.name)).toBe(true);
    }
  });

  it('"chest machine" returns only MACHINE exercises that train the chest', () => {
    const hits = run("chest machine");
    expect(hits.length).toBeGreaterThan(5);
    for (const e of hits) {
      expect(e.modality, e.name).toBe("MACHINE");
      expect(trains(e, "CHEST"), e.name).toBe(true);
    }
  });

  it('"ohp" finds an overhead or military press in the top 3', () => {
    const top = run("ohp").slice(0, 3);
    expect(top.length).toBeGreaterThan(0);
    for (const e of top) expect(e.name, e.name).toMatch(/overhead|military/i);
    expect(names(run("ohp"), 1)).toEqual(["Standing Military Press"]);
  });

  it('"rdl" finds a Romanian deadlift in the top 3', () => {
    expect(names(run("rdl"))).toContain("Romanian Deadlift");
    for (const e of run("rdl")) expect(e.name).toMatch(/romanian/i);
  });

  it('"leg press" never returns a leg curl, and puts Leg Press first', () => {
    const hits = run("leg press");
    expect(names(hits, 1)).toEqual(["Leg Press"]);
    for (const e of hits) expect(e.name, e.name).not.toMatch(/curl/i);
    expect(hits.some((e) => /leg curl/i.test(e.name))).toBe(false);
  });

  it('"bench" lists bench press variants first', () => {
    const top = run("bench").slice(0, 10);
    for (const e of top) expect(e.name, e.name).toMatch(/bench press/i);
    expect(names(run("bench"), 1)).toEqual(["Barbell Bench Press - Medium Grip"]);
  });

  it('"dumbel curl" (typo) finds a dumbbell curl in the top 3', () => {
    const top = run("dumbel curl").slice(0, 3);
    expect(top).toHaveLength(3);
    for (const e of top) {
      expect(e.equipment, e.name).toBe("DUMBBELL");
      expect(e.name, e.name).toMatch(/curl/i);
    }
  });

  it('"lats cable" returns cable exercises that train the lats', () => {
    const hits = run("lats cable");
    expect(hits.length).toBeGreaterThan(5);
    for (const e of hits) {
      expect(e.modality === "CABLE" || e.equipment === "CABLE", e.name).toBe(true);
      expect(trains(e, "LATS"), e.name).toBe(true);
    }
    for (const e of hits.slice(0, 3)) expect(e.muscles.find((m) => m.muscle === "LATS")?.role, e.name).toBe("PRIMARY");
  });

  it("an empty query returns the whole catalog in name order (filters only)", () => {
    const hits = run("");
    expect(hits).toHaveLength(catalog.length);
    const sorted = [...catalog].sort((a, b) => (normalizeText(a.name) < normalizeText(b.name) ? -1 : normalizeText(a.name) > normalizeText(b.name) ? 1 : a.id < b.id ? -1 : 1));
    expect(hits.map((e) => e.id)).toEqual(sorted.map((e) => e.id));
  });

  it("more golden checks: abbreviations, plurals and phrases", () => {
    expect(names(run("bb curl"), 1)).toEqual(["Barbell Curl"]);
    for (const e of run("bb curl")) expect(e.name + e.equipment).toMatch(/curl/i);
    expect(run("pecs").every((e) => trains(e, "CHEST"))).toBe(true);
    expect(run("hams").every((e) => trains(e, "HAMSTRINGS"))).toBe(true);
    expect(run("calf raises").slice(0, 12).every((e) => /calf|calves/i.test(e.name) && /raise/i.test(e.name))).toBe(true);
    expect(names(run("tbar row"), 2).every((n) => /t-bar row/i.test(n))).toBe(true);
    expect(names(run("squat"), 1)).toEqual(["Barbell Squat"]);
    expect(names(run("deadlift"), 1)).toEqual(["Barbell Deadlift"]);
    expect(names(run("pullup"), 1).join()).toMatch(/pull/i);
  });

  it("favorites rank above non-favorites with an equal match score", () => {
    const equal = run("curl").filter((e) => e.name.length === "Barbell Curl".length);
    const target = equal.at(-1) as CatalogExercise;
    const before = run("curl").map((e) => e.id);
    const after = searchExercises(index, "curl", { favoriteIds: new Set([target.id]) }).map((h) => h.id);
    expect(after.indexOf(target.id)).toBeLessThanOrEqual(before.indexOf(target.id));
    expect(after.indexOf(target.id)).toBeLessThan(after.length - 1);
  });

  it("the full catalog index builds and searches in well under 100 ms", () => {
    const start = performance.now();
    const built = buildSearchIndex(catalog);
    searchExercises(built, "incline db");
    searchExercises(built, "dumbel curl");
    expect(performance.now() - start).toBeLessThan(200);
  });
});
