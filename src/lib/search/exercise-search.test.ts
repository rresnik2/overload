import { describe, expect, it } from "vitest";
import {
  ABBREVIATIONS,
  FAVORITE_BOOST,
  TIER_ALIAS,
  TIER_EQUIPMENT,
  TIER_NAME,
  TIER_PREFIX,
  TIER_PRIMARY,
  TIER_SECONDARY,
  TIER_TYPO,
  buildSearchIndex,
  normalizeText,
  searchExercises,
  singularize,
  tokenizeQuery,
  withinOneEdit,
  type SearchableExercise,
} from "./exercise-search";

const ex = (id: string, name: string, extra: Partial<SearchableExercise> = {}): SearchableExercise => ({
  id,
  name,
  aliases: [],
  modality: "FREE_WEIGHT",
  equipment: "BARBELL",
  muscles: [],
  ...extra,
});

const search = (list: SearchableExercise[], query: string, opts?: Parameters<typeof searchExercises>[2]) => searchExercises(buildSearchIndex(list), query, opts);
const ids = (hits: { id: string }[]) => hits.map((h) => h.id);
const tierOf = (score: number) => Math.floor(score / 1000);

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation, turns hyphens and slashes into spaces, collapses whitespace", () => {
    expect(normalizeText("  T-Bar   Row ")).toBe("t bar row");
    expect(normalizeText("Crème/Brûlée")).toBe("creme brulee");
    expect(normalizeText("Farmer’s Walk")).toBe("farmers walk");
    expect(normalizeText("Machine Shoulder (Military) Press")).toBe("machine shoulder military press");
    expect(normalizeText("3/4 Sit-Up")).toBe("3 4 sit up");
    expect(normalizeText("")).toBe("");
    expect(normalizeText("   ")).toBe("");
  });

  it("tokenizes into unique words, at most eight", () => {
    expect(tokenizeQuery("Incline  DB incline")).toEqual(["incline", "db"]);
    expect(tokenizeQuery("a b c d e f g h i j")).toHaveLength(8);
    expect(tokenizeQuery("")).toEqual([]);
  });
});

describe("singularize", () => {
  it("folds plurals to the singular", () => {
    expect(singularize("curls")).toBe("curl");
    expect(singularize("presses")).toBe("press");
    expect(singularize("crunches")).toBe("crunch");
    expect(singularize("flies")).toBe("fly");
    expect(singularize("calves")).toBe("calf");
    expect(singularize("raises")).toBe("raise");
    expect(singularize("dips")).toBe("dip");
  });

  it("leaves short words and words that merely end in s alone", () => {
    expect(singularize("abs")).toBe("abs");
    expect(singularize("bis")).toBe("bis");
    expect(singularize("press")).toBe("press");
    expect(singularize("triceps")).toBe("tricep");
    expect(singularize("lunge")).toBe("lunge");
    expect(singularize("hummus")).toBe("hummus");
  });
});

describe("withinOneEdit", () => {
  it.each([
    ["dumbell", "dumbbell", true],
    ["curl", "curl", true],
    ["curl", "curls", true],
    ["chets", "chest", true], // transposition
    ["chesx", "chest", true], // substitution
    ["chst", "chest", true], // deletion
    ["curl", "carl", true],
    ["curl", "cart", false],
    ["press", "presses", false],
    ["abc", "xyz", false],
    ["abcd", "bacd", true],
    ["abcd", "badc", false],
  ])("%s ~ %s = %s", (a, b, expected) => {
    expect(withinOneEdit(a as string, b as string)).toBe(expected);
    expect(withinOneEdit(b as string, a as string)).toBe(expected);
  });
});

describe("matching", () => {
  const list = [
    ex("incline-db", "Incline Dumbbell Press", { equipment: "DUMBBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY" }, { muscle: "TRICEPS", role: "SECONDARY" }] }),
    ex("flat-bb", "Barbell Bench Press", { muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
    ex("hammer", "Hammer Curls", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("legpress", "Leg Press", { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }, { muscle: "HAMSTRINGS", role: "SECONDARY" }] }),
    ex("legcurl", "Seated Leg Curl", { modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY" }] }),
    ex("tbar", "T-Bar Row", { muscles: [{ muscle: "MIDDLE_BACK", role: "PRIMARY" }] }),
    ex("pushup", "Push-Ups", { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
    ex("rollout", "Ab Roller", { modality: "BODYWEIGHT", equipment: "OTHER", muscles: [{ muscle: "ABDOMINALS", role: "PRIMARY" }] }),
    ex("hammerstrength", "Hammer Strength Row", { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", muscles: [{ muscle: "LATS", role: "PRIMARY" }] }),
    ex("ezcurl", "Close-Grip EZ-Bar Curl", { equipment: "EZ_BAR", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
  ];

  it("requires every query word to match (AND)", () => {
    expect(ids(search(list, "leg press"))).toEqual(["legpress"]);
    expect(ids(search(list, "leg curl"))).toEqual(["legcurl"]);
    expect(search(list, "leg zzzz")).toEqual([]);
  });

  it("matches word prefixes in any order", () => {
    expect(ids(search(list, "incl"))).toEqual(["incline-db"]);
    expect(ids(search(list, "press incline"))).toEqual(["incline-db"]);
  });

  it("matches equipment, modality and muscle words", () => {
    expect(ids(search(list, "dumbbell"))).toEqual(expect.arrayContaining(["incline-db", "hammer"]));
    expect(ids(search(list, "machine chest"))).toEqual([]);
    expect(ids(search(list, "bodyweight chest"))).toEqual(["pushup"]);
    expect(ids(search(list, "hamstrings"))).toEqual(expect.arrayContaining(["legcurl", "legpress"]));
    expect(ids(search(list, "middle back"))).toEqual(["tbar"]);
  });

  it("matches aliases and treats alias hits below name hits", () => {
    const withAlias = [ex("a", "Pulldown", { aliases: ["lat pull"] }), ex("b", "Lat Pulldown Machine")];
    const hits = search(withAlias, "lat");
    expect(ids(hits)).toEqual(["b", "a"]);
    expect(tierOf(hits[1]?.score ?? 0)).toBe(TIER_ALIAS);
  });

  it("matches the slug when a word is only there", () => {
    const hits = search([ex("a", "Weird Name", { slug: "weird-name-hex" })], "hex");
    expect(ids(hits)).toEqual(["a"]);
    expect(tierOf(hits[0]?.score ?? 0)).toBe(TIER_ALIAS);
  });

  it("treats hyphens, slashes and glued words alike", () => {
    expect(ids(search(list, "t bar"))).toEqual(["tbar"]);
    expect(ids(search(list, "tbar"))).toEqual(["tbar"]);
    expect(ids(search(list, "t-bar"))).toEqual(["tbar"]);
    expect(ids(search(list, "pushup"))).toEqual(["pushup"]);
    expect(ids(search(list, "push up"))).toEqual(["pushup"]);
  });

  it("folds plurals in the query", () => {
    expect(ids(search(list, "curls"))).toEqual(expect.arrayContaining(["hammer", "legcurl", "ezcurl"]));
    expect(ids(search(list, "presses"))).toEqual(expect.arrayContaining(["incline-db", "flat-bb", "legpress"]));
  });

  it("does not fold short words incorrectly ('abs' is not 'ab' a prefix of 'abductors')", () => {
    const hits = search([ex("ab", "Ab Roller", { muscles: [{ muscle: "ABDOMINALS", role: "PRIMARY" }] }), ex("abd", "Hip Abduction", { muscles: [{ muscle: "ABDUCTORS", role: "PRIMARY" }] })], "abs");
    expect(ids(hits)).toEqual(["ab"]);
  });

  it("is case, accent and punctuation insensitive", () => {
    expect(ids(search(list, "  LEG,   PRESS! "))).toEqual(["legpress"]);
  });
});

describe("abbreviations", () => {
  const list = [
    ex("incline-db", "Incline Dumbbell Press", { equipment: "DUMBBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
    ex("hammer", "Hammer Curls", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("bbcurl", "Barbell Curl", { muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("kb", "Kettlebell Swing", { equipment: "KETTLEBELL", muscles: [{ muscle: "GLUTES", role: "PRIMARY" }] }),
    ex("ez", "Close-Grip EZ-Bar Curl", { equipment: "EZ_BAR", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("pushup", "Push-Ups", { modality: "BODYWEIGHT", equipment: "BODYWEIGHT", muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
    ex("mil", "Standing Military Press", { muscles: [{ muscle: "SHOULDERS", role: "PRIMARY" }] }),
    ex("oh", "Smith Overhead Press", { modality: "MACHINE", equipment: "SMITH_MACHINE", muscles: [{ muscle: "SHOULDERS", role: "PRIMARY" }] }),
    ex("shp", "Dumbbell Shoulder Press", { equipment: "DUMBBELL", muscles: [{ muscle: "SHOULDERS", role: "PRIMARY" }] }),
    ex("rdl", "Romanian Deadlift", { muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY" }] }),
    ex("sldl", "Stiff-Legged Barbell Deadlift", { muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY" }] }),
    ex("dl", "Deadlift", { muscles: [{ muscle: "LOWER_BACK", role: "PRIMARY" }] }),
    ex("squat", "Squat", { muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }, { muscle: "GLUTES", role: "SECONDARY" }] }),
    ex("calfraise", "Standing Calf Raise", { modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", muscles: [{ muscle: "CALVES", role: "PRIMARY" }] }),
    ex("hammerstrength", "Hammer Strength Row", { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", muscles: [{ muscle: "LATS", role: "PRIMARY" }] }),
    ex("pulldown", "Lat Pulldown", { modality: "CABLE", equipment: "CABLE", muscles: [{ muscle: "LATS", role: "PRIMARY" }] }),
    ex("shrug", "Barbell Shrug", { muscles: [{ muscle: "TRAPS", role: "PRIMARY" }] }),
    ex("trapbar", "Trap Bar Deadlift", { equipment: "TRAP_BAR", muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }] }),
  ];

  it("db, bb, kb, ez, bw expand to equipment", () => {
    expect(ids(search(list, "incline db"))).toEqual(["incline-db"]);
    expect(ids(search(list, "db"))).toEqual(expect.arrayContaining(["incline-db", "hammer", "shp"]));
    expect(ids(search(list, "bb curl"))).toEqual(["bbcurl"]);
    expect(ids(search(list, "kb"))).toEqual(["kb"]);
    expect(ids(search(list, "ez curl"))).toEqual(["ez"]);
    expect(ids(search(list, "bw chest"))).toEqual(["pushup"]);
  });

  it("an abbreviation matches a name containing the full word ahead of an equipment-only match", () => {
    const hits = search(list, "db");
    const byId = new Map(hits.map((h) => [h.id, h.score]));
    expect(tierOf(byId.get("shp") ?? 0)).toBe(TIER_NAME);
    expect(tierOf(byId.get("hammer") ?? 0)).toBe(TIER_EQUIPMENT);
  });

  it("ohp matches overhead and military presses as a phrase", () => {
    expect(ids(search(list, "ohp")).sort()).toEqual(["mil", "oh"]);
  });

  it("rdl and sldl expand to their lifts", () => {
    expect(ids(search(list, "rdl"))).toEqual(["rdl"]);
    expect(ids(search(list, "sldl"))).toEqual(["sldl"]);
  });

  it("muscle nicknames expand to the muscle, never to a name word", () => {
    expect(ids(search(list, "pecs")).sort()).toEqual(["incline-db", "pushup"]);
    expect(ids(search(list, "quads")).sort()).toEqual(["squat", "trapbar"]);
    expect(ids(search(list, "hams")).sort()).toEqual(["rdl", "sldl"]);
    expect(ids(search(list, "glute")).sort()).toEqual(["kb", "squat"]);
    expect(ids(search(list, "calf")).sort()).toEqual(["calfraise"]);
    expect(ids(search(list, "lats")).sort()).toEqual(["hammerstrength", "pulldown"]);
    expect(ids(search(list, "lat"))).toContain("pulldown");
    expect(ids(search(list, "traps"))).toEqual(["shrug"]);
  });

  it("'ham' does not match 'hammer'", () => {
    expect(ids(search(list, "ham"))).not.toContain("hammer");
    expect(ids(search(list, "hammies")).sort()).toEqual(["rdl", "sldl"]);
  });

  it("a raw word that is also an abbreviation still matches whole name words ('trap bar')", () => {
    expect(ids(search(list, "trap bar"))).toContain("trapbar");
  });

  it("every documented abbreviation exists", () => {
    for (const key of ["db", "bb", "kb", "ez", "bw", "ohp", "rdl", "sldl", "pec", "pecs", "quad", "quads", "ham", "hams", "hammies", "glute", "tri", "tris", "bi", "bis", "delt", "delts", "trap", "ab", "abs", "core", "calf", "lat"]) {
      expect(ABBREVIATIONS[key], key).toBeDefined();
    }
  });
});

describe("typos", () => {
  const list = [
    ex("dbcurl", "Dumbbell Curl", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("hammer", "Hammer Curls", { equipment: "DUMBBELL", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
    ex("press", "Leg Press", { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", muscles: [{ muscle: "QUADRICEPS", role: "PRIMARY" }] }),
    ex("curlleg", "Leg Curl", { modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", muscles: [{ muscle: "HAMSTRINGS", role: "PRIMARY" }] }),
    ex("bench", "Bench Press", { muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
  ];

  it("allows one edit for words of five or more characters", () => {
    const hits = search(list, "dumbel curl");
    expect(ids(hits)).toEqual(["dbcurl", "hammer"]);
    expect(tierOf(hits[0]?.score ?? 0)).toBe(TIER_TYPO);
    expect(ids(search(list, "bnech press"))).toEqual(["bench"]);
    expect(ids(search(list, "benhc"))).toEqual(["bench"]);
  });

  it("ranks a typo in the name above a typo in the equipment", () => {
    expect(ids(search(list, "dumbel curl"))[0]).toBe("dbcurl");
  });

  it("never applies to words shorter than five characters", () => {
    expect(search(list, "cur")).toHaveLength(3); // prefix, not a typo
    expect(search(list, "curk")).toEqual([]);
    expect(search(list, "benh")).toEqual([]);
  });

  it("a typo word does not rescue an exercise that lacks the other words (leg press never returns leg curl)", () => {
    expect(ids(search(list, "leg press"))).toEqual(["press"]);
    expect(ids(search(list, "leg pres"))).toEqual(["press"]);
  });

  it("does not use a typo when the word already matches exactly", () => {
    const hits = search(list, "press");
    expect(hits.every((h) => tierOf(h.score) > TIER_TYPO)).toBe(true);
  });
});

describe("ranking", () => {
  it("orders the tiers: name prefix > name word > alias > primary > equipment/modality > secondary > typo", () => {
    const list = [
      ex("sec", "Zottman Raise", { equipment: "OTHER", muscles: [{ muscle: "BICEPS", role: "SECONDARY" }] }),
      ex("eq", "Zottman Press", { equipment: "DUMBBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }),
      ex("pri", "Zottman Row", { equipment: "OTHER", muscles: [{ muscle: "BICEPS", role: "PRIMARY" }] }),
      ex("ali", "Zottman Fly", { equipment: "OTHER", aliases: ["biceps burner"] }),
      ex("nam", "Heavy Biceps Burn", { equipment: "OTHER" }),
      ex("pre", "Biceps Burner Deluxe", { equipment: "OTHER" }),
    ];
    // one-word query "biceps": prefix tier for "Biceps Burner Deluxe", name for "Heavy Biceps Burn", alias for Fly...
    const hits = search(list, "biceps");
    expect(ids(hits)).toEqual(["pre", "nam", "ali", "pri", "sec"]);
    expect(hits.map((h) => tierOf(h.score))).toEqual([TIER_PREFIX, TIER_NAME, TIER_ALIAS, TIER_PRIMARY, TIER_SECONDARY]);
  });

  it("an equipment-only match sits between primary and secondary muscle matches", () => {
    const list = [
      ex("sec", "Alpha", { equipment: "BARBELL", muscles: [{ muscle: "CHEST", role: "SECONDARY" }] }),
      ex("eq", "Bravo", { equipment: "DUMBBELL" }),
      ex("pri", "Charlie", { equipment: "BARBELL", muscles: [{ muscle: "SHOULDERS", role: "PRIMARY" }] }),
    ];
    const index = buildSearchIndex(list);
    expect(searchExercises(index, "dumbbell").map((h) => tierOf(h.score))).toEqual([TIER_EQUIPMENT]);
    expect(searchExercises(index, "shoulders").map((h) => tierOf(h.score))).toEqual([TIER_PRIMARY]);
    expect(searchExercises(index, "chest").map((h) => tierOf(h.score))).toEqual([TIER_SECONDARY]);
  });

  it("an exercise is only as good as its weakest word", () => {
    const list = [
      ex("a", "Cable Row", { modality: "CABLE", equipment: "CABLE", muscles: [{ muscle: "LATS", role: "SECONDARY" }] }),
      ex("b", "Wide Pulldown", { modality: "CABLE", equipment: "CABLE", muscles: [{ muscle: "LATS", role: "PRIMARY" }] }),
    ];
    const hits = search(list, "lats cable");
    expect(ids(hits)).toEqual(["b", "a"]);
    expect(tierOf(hits[0]?.score ?? 0)).toBe(TIER_EQUIPMENT);
    expect(tierOf(hits[1]?.score ?? 0)).toBe(TIER_SECONDARY);
  });

  it("breaks score ties by shorter name, then alphabetical, then id", () => {
    const list = [ex("3", "Press B Longer"), ex("2", "Press B"), ex("1", "Press A"), ex("0", "Press A")];
    expect(ids(search(list, "press"))).toEqual(["0", "1", "2", "3"]);
  });

  it("is deterministic and independent of input order", () => {
    const list = [ex("a", "Curl One"), ex("b", "Curl Two"), ex("c", "Hammer Curl"), ex("d", "Curl")];
    const forward = ids(search(list, "curl"));
    const backward = ids(search([...list].reverse(), "curl"));
    expect(backward).toEqual(forward);
    expect(ids(search(list, "curl"))).toEqual(forward);
  });

  it("favorites win ties inside a tier but never cross a tier", () => {
    const list = [ex("plain", "Cable Fly"), ex("fav", "Cable Flyes Long Name"), ex("prefix", "Fly Something")];
    const favoriteIds = new Set(["fav"]);
    // "fly": Cable Fly and Fly Something are prefix/name tiers; "Flyes" is a prefix match inside the same name tier as Cable Fly.
    const hits = search(list, "fly", { favoriteIds });
    const tiers = new Map(hits.map((h) => [h.id, tierOf(h.score)]));
    expect(tiers.get("fav")).toBe(TIER_NAME);
    expect(tiers.get("plain")).toBe(TIER_NAME);
    expect(ids(hits)[0]).toBe("prefix"); // a lower-tier favorite never beats a higher tier
    expect(ids(hits).indexOf("fav")).toBeLessThan(ids(hits).indexOf("plain"));
  });

  it("the favorite boost is bigger than any detail and smaller than a tier", () => {
    expect(FAVORITE_BOOST).toBeGreaterThan(200);
    expect(FAVORITE_BOOST).toBeLessThan(1000);
  });

  it("main lifts rank ahead of other name-prefix matches ('bench' lists bench presses first)", () => {
    const list = [
      ex("dips", "Bench Dips", { mechanic: "COMPOUND" }),
      ex("squat", "Barbell Squat To A Bench", { mechanic: "COMPOUND" }),
      ex("press", "Barbell Bench Press", { mechanic: "COMPOUND", standardLift: "BENCH_PRESS" }),
      ex("close", "Close-Grip Bench Press", { mechanic: "COMPOUND" }),
    ];
    expect(ids(search(list, "bench"))).toEqual(["press", "close", "dips", "squat"]);
  });

  it("limit truncates after ranking", () => {
    const list = [ex("c", "Curl C"), ex("b", "Curl B"), ex("a", "Curl A")];
    expect(ids(search(list, "curl", { limit: 2 }))).toEqual(["a", "b"]);
    expect(search(list, "curl", { limit: 0 })).toEqual([]);
  });

  it("scores and ranks 900 exercises quickly", () => {
    const many = Array.from({ length: 900 }, (_, i) => ex(String(i).padStart(4, "0"), `Exercise ${i} Dumbbell Variation ${i % 7}`, { equipment: "DUMBBELL", muscles: [{ muscle: "CHEST", role: "PRIMARY" }] }));
    const start = performance.now();
    const index = buildSearchIndex(many);
    for (const q of ["incline db", "dumbel var", "pecs", "e"]) searchExercises(index, q);
    expect(performance.now() - start).toBeLessThan(500);
  });
});

describe("empty query", () => {
  it("returns every indexed exercise in name order with score 0 and no favorite boost", () => {
    const list = [ex("2", "Zeta"), ex("1", "Alpha"), ex("3", "Mu")];
    const hits = search(list, "   ", { favoriteIds: new Set(["2"]) });
    expect(hits).toEqual([
      { id: "1", score: 0 },
      { id: "3", score: 0 },
      { id: "2", score: 0 },
    ]);
  });

  it("respects the limit", () => {
    expect(search([ex("2", "Zeta"), ex("1", "Alpha")], "", { limit: 1 })).toEqual([{ id: "1", score: 0 }]);
  });
});
