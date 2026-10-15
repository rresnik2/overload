// Keyword exercise search: ONE pure implementation shared by the offline picker (Dexie, via repo.exercises.search) and the
// server library (listLibrary), so both return the same results for the same exercises, query and filters.
//
// Matching. The query is normalized (lowercase, accents and punctuation stripped, hyphens and slashes become spaces) and
// split into words. EVERY word must match something on the exercise (AND). A word matches, by word-prefix, in:
//   name words > alias words (and slug) > primary-muscle words > equipment / modality words > secondary-muscle words.
// Gym abbreviations expand first ("db" -> dumbbell, "ohp" -> overhead press | military press, "pecs" -> chest, ...); a
// multi-word expansion matches when all of its words are found in one field. Plural query words fold to the singular
// ("curls" = "curl", "presses" = "press"; words of three letters or fewer, like "abs", never fold). A word of 5+ letters
// with no exact/prefix hit anywhere on the exercise may match with one typo (Damerau-Levenshtein <= 1) at the lowest tier.
//
// Ranking (deterministic). score = tier * 1000 + favorite boost + detail, sorted by score descending, then shorter name,
// then normalized name, then id:
//   tier 7  the whole query is a prefix of the name ("bench pr" -> "Bench Press - Powerlifting")
//   tier 6  every word matches a name word
//   tier 5  weakest word matches an alias
//   tier 4  weakest word matches a primary muscle
//   tier 3  weakest word matches equipment or modality
//   tier 2  weakest word matches a secondary muscle
//   tier 1  at least one word matched only through a typo
// An exercise's tier is the tier of its WEAKEST word (a hit is only as good as its worst match).
// Favorites get +500: more than any detail (< 500), less than one tier gap (1000), so a favorite only wins ties inside a
// tier. detail rewards, per word, the better field (name 5 .. secondary 1) and the better kind of match (exact word 2,
// prefix 1, folded/abbreviation/typo 0); +6 when the query words form a consecutive phrase in the name ("leg press" in
// "Narrow Stance Leg Press", not in "Leg-Over Floor Press"); +1 when the first query word starts the name; +3 for a
// standard-lift exercise; +2 for a compound movement.
// Main-lift prior (beyond the plain tiers): an exercise whose name contains a main lift ("bench press", "squat",
// "deadlift", "overhead press", "military press", "barbell row", "pull up") that matches every query word on its NAME is
// promoted to tier 7 with +20 detail, so "bench" lists the bench presses before "Bench Dips" and "Bench Jump".
//
// PURE: no react/next/server/client imports; it runs in the browser and on the server.
import type { ExerciseMuscleEntry } from "@/contracts/entities";
import type { Equipment, Mechanic, Modality, Muscle, StandardLift } from "@/contracts/enums";

// ───────────────────────────── public types ─────────────────────────────

/** The slice of an ExerciseRow the search reads (any Row or server row with these fields can be indexed). */
export interface SearchableExercise {
  id: string;
  name: string;
  slug?: string;
  aliases: readonly string[];
  modality: Modality;
  equipment: Equipment;
  muscles: readonly ExerciseMuscleEntry[];
  standardLift?: StandardLift | null;
  mechanic?: Mechanic | null;
}

export interface ExerciseHit {
  id: string;
  /** Higher is better; see the ranking notes above. 0 for an empty query (name order). */
  score: number;
}

export interface SearchOptions {
  /** Favorites win ties inside a tier. */
  favoriteIds?: ReadonlySet<string>;
  limit?: number;
}

// ───────────────────────────── scoring constants ─────────────────────────────

export const TIER_PREFIX = 7;
export const TIER_NAME = 6;
export const TIER_ALIAS = 5;
export const TIER_PRIMARY = 4;
export const TIER_EQUIPMENT = 3;
export const TIER_SECONDARY = 2;
export const TIER_TYPO = 1;
export const FAVORITE_BOOST = 500;
const TIER_STEP = 1000;

const MAX_QUERY_WORDS = 8;
const MIN_TYPO_LENGTH = 5;

type Group = "name" | "alias" | "primary" | "equipment" | "secondary";
const GROUPS: readonly Group[] = ["name", "alias", "primary", "equipment", "secondary"];
const GROUP_TIER: Record<Group, number> = { name: TIER_NAME, alias: TIER_ALIAS, primary: TIER_PRIMARY, equipment: TIER_EQUIPMENT, secondary: TIER_SECONDARY };
const GROUP_RANK: Record<Group, number> = { name: 5, alias: 4, primary: 3, equipment: 2, secondary: 1 };

type Kind = "exact" | "prefix" | "folded" | "typo";
const KIND_RANK: Record<Kind, number> = { exact: 2, prefix: 1, folded: 0, typo: 0 };

// ───────────────────────────── vocabulary ─────────────────────────────

type Expansions = readonly (readonly string[])[];

/** Equipment and movement abbreviations: word -> alternatives, each a list of words that must ALL match in one field. */
export const TERM_ABBREVIATIONS: Readonly<Record<string, Expansions>> = {
  db: [["dumbbell"]],
  bb: [["barbell"]],
  kb: [["kettlebell"]],
  ez: [["ez", "bar"]],
  bw: [["bodyweight"]],
  ohp: [
    ["overhead", "press"],
    ["military", "press"],
  ],
  rdl: [["romanian", "deadlift"]],
  sldl: [["stiff", "leg", "deadlift"]],
};

/** Muscle nicknames: they expand to the muscle only ("pecs" finds chest work, not "One Knee To Chest"). */
export const MUSCLE_ABBREVIATIONS: Readonly<Record<string, Expansions>> = {
  pec: [["chest"]],
  pecs: [["chest"]],
  quad: [["quadriceps"]],
  quads: [["quadriceps"]],
  ham: [["hamstrings"]],
  hams: [["hamstrings"]],
  hammies: [["hamstrings"]],
  glute: [["glutes"]],
  tri: [["triceps"]],
  tris: [["triceps"]],
  bi: [["biceps"]],
  bis: [["biceps"]],
  delt: [["shoulders"]],
  delts: [["shoulders"]],
  trap: [["traps"]],
  traps: [["traps"]],
  ab: [["abdominals"]],
  abs: [["abdominals"]],
  core: [["abdominals"]],
  calf: [["calves"]],
  lat: [["lats"]],
  lats: [["lats"]],
};

export const ABBREVIATIONS: Readonly<Record<string, Expansions>> = { ...TERM_ABBREVIATIONS, ...MUSCLE_ABBREVIATIONS };

/** Main-lift phrases (word-prefix matched on consecutive name words); see the header for the promotion rule. */
const MAIN_LIFT_PHRASES: readonly (readonly string[])[] = [
  ["bench", "press"],
  ["squat"],
  ["deadlift"],
  ["overhead", "press"],
  ["military", "press"],
  ["barbell", "row"],
  ["pull", "up"],
  ["pullup"],
  ["chin", "up"],
  ["chinup"],
];

const IRREGULAR_SINGULARS: Readonly<Record<string, string>> = { calves: "calf" };

/** Search terms per equipment (the label first, then synonyms). */
const EQUIPMENT_TERMS: Readonly<Record<Equipment, readonly string[]>> = {
  BARBELL: ["barbell"],
  DUMBBELL: ["dumbbell"],
  KETTLEBELL: ["kettlebell"],
  EZ_BAR: ["ez bar"],
  TRAP_BAR: ["trap bar", "hex bar"],
  PLATE: ["plate"],
  MEDICINE_BALL: ["medicine ball"],
  SMITH_MACHINE: ["smith machine"],
  MACHINE_SELECTORIZED: ["selectorized machine"],
  MACHINE_PLATE_LOADED: ["plate loaded machine"],
  CABLE: ["cable"],
  BODYWEIGHT: ["bodyweight"],
  BAND: ["band", "resistance band"],
  EXERCISE_BALL: ["exercise ball", "swiss ball", "stability ball"],
  FOAM_ROLL: ["foam roll"],
  OTHER: [],
};

const MODALITY_TERMS: Readonly<Record<Modality, readonly string[]>> = {
  FREE_WEIGHT: ["free weight"],
  MACHINE: ["machine"],
  CABLE: ["cable"],
  BODYWEIGHT: ["bodyweight"],
  BAND: ["band"],
  OTHER: [],
};

const MUSCLE_TERMS: Readonly<Record<Muscle, readonly string[]>> = {
  ABDOMINALS: ["abdominals"],
  ABDUCTORS: ["abductors"],
  ADDUCTORS: ["adductors"],
  BICEPS: ["biceps"],
  CALVES: ["calves"],
  CHEST: ["chest"],
  FOREARMS: ["forearms"],
  GLUTES: ["glutes"],
  HAMSTRINGS: ["hamstrings"],
  LATS: ["lats", "latissimus"],
  LOWER_BACK: ["lower back"],
  MIDDLE_BACK: ["middle back"],
  NECK: ["neck"],
  QUADRICEPS: ["quadriceps"],
  SHOULDERS: ["shoulders", "deltoids"],
  TRAPS: ["traps", "trapezius"],
  TRICEPS: ["triceps"],
};

// ───────────────────────────── text helpers ─────────────────────────────

/** Lowercase, strip accents and punctuation, hyphens/slashes/anything else non-alphanumeric become spaces, collapse whitespace. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const wordsOf = (normalized: string): string[] => (normalized ? normalized.split(" ") : []);

/** Query words: normalized, de-duplicated, at most MAX_QUERY_WORDS. */
export function tokenizeQuery(query: string): string[] {
  return [...new Set(wordsOf(normalizeText(query)))].slice(0, MAX_QUERY_WORDS);
}

/** Light plural folding for query words ("curls" -> "curl", "presses" -> "press", "calves" -> "calf"); words of <= 3 letters never fold. */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  const irregular = IRREGULAR_SINGULARS[word];
  if (irregular) return irregular;
  if (/(sses|shes|ches|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  return word.endsWith("s") ? word.slice(0, -1) : word;
}

/** True when `a` and `b` are at most one insertion, deletion, substitution or adjacent transposition apart. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // transposition
  }
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  return long.slice(i + 1) === short.slice(i);
}

/** Typo match of a query word against a (possibly partially typed) word: one edit from the word or from one of its near-length prefixes. */
function nearWord(token: string, word: string): boolean {
  if (word.length < token.length - 1) return false;
  for (const length of [token.length - 1, token.length, token.length + 1]) {
    if (length >= 1 && withinOneEdit(token, word.slice(0, length))) return true;
  }
  return false;
}

// ───────────────────────────── index ─────────────────────────────

interface IndexedExercise {
  id: string;
  nameNorm: string;
  nameLength: number;
  words: Record<Group, string[]>;
  /** Adjacent name words glued together ("push ups" -> "pushups"); matched by prefix for query words of 4+ letters. */
  joined: string[];
  standardLift: boolean;
  compound: boolean;
  /** [first, last] name-word positions of each main-lift phrase in the name. */
  mainSpans: [number, number][];
}

export interface SearchIndex {
  readonly items: readonly IndexedExercise[];
}

function mainLiftSpans(nameWords: readonly string[]): [number, number][] {
  const spans: [number, number][] = [];
  for (const phrase of MAIN_LIFT_PHRASES) {
    for (let start = 0; start + phrase.length <= nameWords.length; start++) {
      if (phrase.every((pw, offset) => (nameWords[start + offset] as string).startsWith(pw))) spans.push([start, start + phrase.length - 1]);
    }
  }
  return spans;
}

const termWords = (terms: readonly string[]): string[] => terms.flatMap((t) => wordsOf(normalizeText(t)));

/** Precompute the normalized fields once (the picker keeps the index while the catalog is unchanged). */
export function buildSearchIndex(exercises: readonly SearchableExercise[]): SearchIndex {
  const items = exercises.map((e): IndexedExercise => {
    const nameNorm = normalizeText(e.name);
    const nameWords = wordsOf(nameNorm);
    const joined: string[] = [];
    for (let i = 0; i + 1 < nameWords.length; i++) joined.push(`${nameWords[i]}${nameWords[i + 1]}`);
    const aliasWords = e.aliases.flatMap((a) => wordsOf(normalizeText(a)));
    // The slug mostly repeats the name; words that only the slug has count like an alias.
    for (const w of wordsOf(normalizeText(e.slug ?? ""))) if (!nameWords.includes(w) && !aliasWords.includes(w)) aliasWords.push(w);
    const primary: string[] = [];
    const secondary: string[] = [];
    for (const m of e.muscles) (m.role === "PRIMARY" ? primary : secondary).push(...termWords(MUSCLE_TERMS[m.muscle]));
    return {
      id: e.id,
      nameNorm,
      nameLength: nameNorm.length,
      words: {
        name: nameWords,
        alias: aliasWords,
        primary,
        equipment: [...termWords(EQUIPMENT_TERMS[e.equipment]), ...termWords(MODALITY_TERMS[e.modality])],
        secondary,
      },
      joined,
      standardLift: e.standardLift != null,
      compound: e.mechanic === "COMPOUND",
      mainSpans: mainLiftSpans(nameWords),
    };
  });
  return { items };
}

// ───────────────────────────── matching ─────────────────────────────

interface Pattern {
  words: readonly string[];
  /** Whole-word equality only (raw abbreviations: "ham" must not match "hammer"). */
  exactOnly: boolean;
  folded: boolean;
  /** Restrict the pattern to these fields (muscle nicknames). */
  groups?: readonly Group[];
}

interface TokenMatch {
  tier: number;
  group: Group;
  kind: Kind;
}

const MUSCLE_GROUPS: readonly Group[] = ["primary", "secondary"];

function patternsFor(token: string): Pattern[] {
  const expansions = ABBREVIATIONS[token];
  if (expansions) {
    const groups = token in MUSCLE_ABBREVIATIONS ? MUSCLE_GROUPS : undefined;
    return [{ words: [token], exactOnly: true, folded: false }, ...expansions.map((words) => ({ words, exactOnly: false, folded: true, groups }))];
  }
  const stem = singularize(token);
  const patterns: Pattern[] = [{ words: [token], exactOnly: false, folded: false }];
  if (stem !== token) patterns.push({ words: [stem], exactOnly: false, folded: true });
  return patterns;
}

/** The kind of match of one pattern within one field's words, or null. */
function matchPattern(pattern: Pattern, words: readonly string[], joined: readonly string[] | null): Kind | null {
  let kind: Kind = "exact";
  for (const pw of pattern.words) {
    let best: Kind | null = null;
    for (const w of words) {
      if (w === pw) {
        best = "exact";
        break;
      }
      if (!pattern.exactOnly && w.startsWith(pw)) best = "prefix";
    }
    if (!best && joined && pw.length >= 4 && joined.some((j) => (pattern.exactOnly ? j === pw : j.startsWith(pw)))) best = "prefix";
    if (!best) return null;
    if (best === "prefix" && kind === "exact") kind = "prefix";
  }
  if (pattern.folded) return "folded";
  return pattern.words.length === 1 ? kind : "prefix";
}

function matchToken(item: IndexedExercise, token: string, patterns: readonly Pattern[]): TokenMatch | null {
  for (const group of GROUPS) {
    // One-letter words only ever match name words ("t bar", "a1"); elsewhere they would match everything.
    if (token.length < 2 && group !== "name") continue;
    let best: Kind | null = null;
    for (const pattern of patterns) {
      if (pattern.groups && !pattern.groups.includes(group)) continue;
      const kind = matchPattern(pattern, item.words[group], group === "name" ? item.joined : null);
      if (kind && (best === null || KIND_RANK[kind] > KIND_RANK[best])) best = kind;
    }
    if (best) return { tier: GROUP_TIER[group], group, kind: best };
  }
  if (token.length >= MIN_TYPO_LENGTH && !ABBREVIATIONS[token]) {
    for (const group of GROUPS) {
      if (item.words[group].some((w) => nearWord(token, w))) return { tier: TIER_TYPO, group, kind: "typo" };
    }
  }
  return null;
}

const wordMatches = (pattern: Pattern, word: string): boolean => (pattern.exactOnly ? word === pattern.words[0] : word.startsWith(pattern.words[0] as string));

/** True when the query words match consecutive name words in order ("leg press" in "narrow stance leg press"). */
function isPhrase(nameWords: readonly string[], patterns: readonly (readonly Pattern[])[]): boolean {
  for (let start = 0; start + patterns.length <= nameWords.length; start++) {
    const ok = patterns.every((options, offset) => options.some((p) => p.words.length === 1 && wordMatches(p, nameWords[start + offset] as string)));
    if (ok) return true;
  }
  return false;
}

/** Name-word positions a query word matched (any pattern, any word of a multi-word expansion). */
function matchedNameIndices(nameWords: readonly string[], patterns: readonly Pattern[]): Set<number> {
  const out = new Set<number>();
  for (const pattern of patterns) {
    if (pattern.groups && !pattern.groups.includes("name")) continue;
    for (const pw of pattern.words) nameWords.forEach((w, i) => (pattern.exactOnly ? w === pw : w.startsWith(pw)) && out.add(i));
  }
  return out;
}

/** True when every query word matched inside one main-lift phrase of the name ("bench" in "Barbell Bench Press", not in "Barbell Squat To A Bench"). */
function inMainLift(item: IndexedExercise, patterns: readonly (readonly Pattern[])[]): boolean {
  if (item.mainSpans.length === 0) return false;
  const matched = patterns.map((p) => matchedNameIndices(item.words.name, p));
  return item.mainSpans.some(([first, last]) => matched.every((indices) => [...indices].some((i) => i >= first && i <= last)));
}

// ───────────────────────────── search ─────────────────────────────

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Exercises matching every word of `query`, best first. An empty query returns every indexed exercise in name order
 * (score 0, no favorite boost): filters-only behaviour. Deterministic for equal input.
 */
export function searchExercises(index: SearchIndex, query: string, opts: SearchOptions = {}): ExerciseHit[] {
  const queryNorm = normalizeText(query);
  const tokens = tokenizeQuery(query);
  const order = (a: IndexedExercise, b: IndexedExercise) => a.nameLength - b.nameLength || compareStrings(a.nameNorm, b.nameNorm) || compareStrings(a.id, b.id);

  let hits: { item: IndexedExercise; score: number }[];
  if (tokens.length === 0) {
    hits = index.items.map((item) => ({ item, score: 0 }));
    hits.sort((a, b) => compareStrings(a.item.nameNorm, b.item.nameNorm) || compareStrings(a.item.id, b.item.id));
  } else {
    const patterns = tokens.map(patternsFor);
    hits = [];
    for (const item of index.items) {
      let tier = Number.POSITIVE_INFINITY;
      let detail = 0;
      let matched = true;
      for (let i = 0; i < tokens.length; i++) {
        const m = matchToken(item, tokens[i] as string, patterns[i] as Pattern[]);
        if (!m) {
          matched = false;
          break;
        }
        tier = Math.min(tier, m.tier);
        detail += GROUP_RANK[m.group] * 4 + KIND_RANK[m.kind];
      }
      if (!matched) continue;
      if (item.nameNorm.startsWith(queryNorm)) tier = TIER_PREFIX;
      if (tier >= TIER_NAME && inMainLift(item, patterns)) {
        tier = TIER_PREFIX;
        detail += 20;
      }
      if (tokens.length > 1 && isPhrase(item.words.name, patterns)) detail += 6;
      if (item.words.name[0]?.startsWith(tokens[0] as string)) detail += 1;
      if (item.standardLift) detail += 3;
      if (item.compound) detail += 2;
      const favorite = opts.favoriteIds?.has(item.id) ? FAVORITE_BOOST : 0;
      hits.push({ item, score: tier * TIER_STEP + favorite + detail });
    }
    hits.sort((a, b) => b.score - a.score || order(a.item, b.item));
  }
  const limited = opts.limit !== undefined ? hits.slice(0, Math.max(0, opts.limit)) : hits;
  return limited.map(({ item, score }) => ({ id: item.id, score }));
}
