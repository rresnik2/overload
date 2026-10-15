// Post-checks on a generated narrative: numeric grounding, factRefs, tone. Pure.
import { collectFactIds, type InsightFacts, type InsightNarrative } from "@/contracts/insights";

const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
/** "1,200" | "82.4" | "10" (the thousands form must come first so "1,200" is one number). */
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
/** "e1RM", "1RM", "e1RMs": the digit is part of the term, not a quantity. */
const ONE_RM_RE = /\be?1RMs?\b/gi;

const key = (n: number) => String(Math.round(Math.abs(n) * 1e6) / 1e6);

/** Every quantity written in a piece of text, as comparable keys. Dates contribute their year, month and day. */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  const withoutDates = text.replace(DATE_RE, (_m, y: string, mo: string, d: string) => {
    out.push(key(Number(y)), key(Number(mo)), key(Number(d)));
    return " ";
  });
  for (const m of withoutDates.replace(ONE_RM_RE, " ").matchAll(NUMBER_RE)) out.push(key(Number(m[0].replaceAll(",", ""))));
  return out;
}

function collectNumbers(value: unknown, into: Set<string>): void {
  if (typeof value === "number") into.add(key(value));
  else if (typeof value === "string") for (const k of extractNumbers(value)) into.add(k);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectNumbers(v, into);
}

/** Every number the facts contain (signs dropped: "down 1.2 kg" is grounded by -1.2). */
export function numbersInFacts(facts: InsightFacts): Set<string> {
  const into = new Set<string>();
  collectNumbers(facts, into);
  return into;
}

/** All prose of a narrative, field by field. */
export function narrativeTexts(narrative: InsightNarrative): string[] {
  return [
    narrative.headline,
    narrative.summary,
    ...narrative.sections.flatMap((s) => [s.title, s.body]),
    ...narrative.actions.map((a) => a.text),
  ];
}

/** Numbers the narrative states that are not in the facts (deduplicated, in order of appearance). */
export function ungroundedNumbers(narrative: InsightNarrative, facts: InsightFacts): string[] {
  const allowed = numbersInFacts(facts);
  const bad: string[] = [];
  for (const text of narrativeTexts(narrative)) {
    for (const n of extractNumbers(text)) if (!allowed.has(n) && !bad.includes(n)) bad.push(n);
  }
  return bad;
}

/** factRefs ids that do not exist in the facts. */
export function unknownFactRefs(narrative: InsightNarrative, facts: InsightFacts): string[] {
  const known = collectFactIds(facts);
  const bad: string[] = [];
  const refs = [...narrative.sections.flatMap((s) => s.factRefs), ...narrative.actions.flatMap((a) => a.factRefs)];
  for (const id of refs) if (!known.has(id) && !bad.includes(id)) bad.push(id);
  return bad;
}

const MEDICAL_RE = /\b(diagnos\w*|prescri\w*|medicat\w*|steroids?|disorders?|diseases?|syndrome|therapy|clinical\w*)\b/gi;
const LOADED_BODY_RE = /\b(obese|obesity|overweight|underweight|skinny|flabby|chubby|fat)\b/gi;

/** Wording that breaks the no-medical-advice / neutral-body-composition rules. Returns the offending words. */
export function toneViolations(narrative: InsightNarrative): string[] {
  const found: string[] = [];
  for (const raw of narrativeTexts(narrative)) {
    const text = raw.replace(/\bbody[- ]fat\b/gi, "bodyfat").replace(/\bfat-free\b/gi, "ffree");
    for (const re of [MEDICAL_RE, LOADED_BODY_RE]) {
      for (const m of text.matchAll(re)) if (!found.includes(m[0].toLowerCase())) found.push(m[0].toLowerCase());
    }
  }
  return found;
}

export interface NarrativeProblems {
  ungroundedNumbers: string[];
  unknownFactRefs: string[];
  toneViolations: string[];
}

export function checkNarrative(narrative: InsightNarrative, facts: InsightFacts): NarrativeProblems | null {
  const problems = {
    ungroundedNumbers: ungroundedNumbers(narrative, facts),
    unknownFactRefs: unknownFactRefs(narrative, facts),
    toneViolations: toneViolations(narrative),
  };
  return problems.ungroundedNumbers.length || problems.unknownFactRefs.length || problems.toneViolations.length ? problems : null;
}

/** Plain-language feedback for the retry turn. */
export function describeProblems(p: NarrativeProblems): string {
  const lines: string[] = [];
  if (p.ungroundedNumbers.length) lines.push(`These numbers do not appear in the facts: ${p.ungroundedNumbers.join(", ")}. Use only numbers copied exactly from the facts; do not round, convert or compute; write other quantities in words.`);
  if (p.unknownFactRefs.length) lines.push(`These factRefs are not fact ids: ${p.unknownFactRefs.join(", ")}. Cite only ids that exist in the facts.`);
  if (p.toneViolations.length) lines.push(`Remove this wording (no medical language, neutral body-composition language): ${p.toneViolations.join(", ")}.`);
  return lines.join("\n");
}
