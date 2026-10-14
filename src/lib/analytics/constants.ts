// Cited constants for analytics. Stream D extends this file (every constant gets a citation key from CITATIONS;
// the evidence is in docs/research.md). Phase 0 only defines what estimate1RM/effectiveLoadKg need.

/** No e1RM estimate when reps + RIR exceeds this (formulas are unreliable above ~10-12; Reynolds 2006). */
export const E1RM_MAX_EFFECTIVE_REPS = 12;
/** Estimates with reps + RIR above this are flagged low-confidence. */
export const E1RM_LOW_CONFIDENCE_ABOVE_REPS = 10;
/** Stored precision of e1rmKg / effectiveLoadKg (Decimal(7,3)). */
export const KG_DP = 3;
/** A change smaller than ~5% is noise: 1RM test-retest CV is ~4% (Grgic 2020). */
export const NOISE_THRESHOLD = 0.05;

export interface Citation {
  key: string;
  label: string;
  url: string;
}

/**
 * Registry referenced by InsightCard.citations. Stream D fills this from docs/research.md (keys like "schoenfeld2017",
 * "grgic2020"). Phase 0 ships it empty on purpose: a card may not cite a key that is not in this registry.
 */
export const CITATIONS: Record<string, Citation> = {};
