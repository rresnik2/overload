// Cited constants for analytics. Every evidence-based threshold and coefficient lives in this one file, each with a
// citation key from CITATIONS (the evidence is in docs/research.md). A value that is a modelling assumption rather
// than a published number says so ("ASSUMPTION"). Coefficients that docs/research.md marks [Verify] are listed in
// DISABLED_COEFFICIENTS and are NOT implemented anywhere.
import type { ExperienceLevel, TrainingGoal } from "@/contracts/enums";

// ───────────────────────────── citations ─────────────────────────────

export interface Citation {
  key: string;
  label: string;
  url: string;
}

const cite = (key: string, label: string, url: string): [string, Citation] => [key, { key, label, url }];

/**
 * Registry referenced by InsightCard.citations. Every entry has a link in docs/research.md. Sources the brief only
 * names "from memory" (Haun 2019, Helms 2014, Schoenfeld 2016, Morton 2018, Reynolds 2006, LeSuer 1997, Schoenfeld 2019,
 * NSCA 2-for-2) are deliberately absent until a link is found: a card may not cite a key that is not in this registry.
 */
export const CITATIONS: Record<string, Citation> = Object.fromEntries([
  cite("jorgenson2020", "Jorgenson 2020: muscle fiber hypertrophy with resistance training", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7408414/"),
  cite("antonio1993", "Antonio & Gonyea 1993: skeletal muscle fiber hyperplasia", "https://pubmed.ncbi.nlm.nih.gov/8107539/"),
  cite("macdougall1984", "MacDougall 1984: muscle fiber number in bodybuilders", "https://experts.mcmaster.ca/scholarly-works/236035"),
  cite("gowda2025", "Gowda 2025 (abstract): hyperplasia meta-analysis", "https://rdw.rowan.edu/stratford_research_day/2025/may1/194"),
  cite("dantona", "D'Antona: a likely role for fibre hyperplasia in humans [Contested]", "https://www.physoc.org/magazine-articles/muscle-mass-at-the-top-a-likely-role-for-fibre-hyperplasia-in-humans/"),
  cite("roberts2020sarcoplasmic", "Roberts 2020: sarcoplasmic hypertrophy", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7372125/"),
  cite("schoenfeld2017volume", "Schoenfeld 2017: dose-response of weekly volume and muscle mass", "https://paulogentil.com/pdf/Dose-response%20relationship%20between%20weekly%20resistance%20training%20volume%20and%20increases%20in%20muscle%20mass%20-%20A%20systematic%20review%20and%20metaanalysis.pdf"),
  cite("schoenfeld2017load", "Schoenfeld 2017: low- vs high-load training", "https://pubmed.ncbi.nlm.nih.gov/28834797/"),
  cite("pelland2025", "Pelland 2025: volume and frequency meta-regression", "https://sponet.de/sponet/Record/4097139?lng=en"),
  cite("bazvalle2022", "Baz-Valle 2022: weekly sets and hypertrophy", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884877/"),
  cite("remmert2025", "Remmert 2025 (preprint, [Contested]): per-session set ceiling", "https://sportrxiv.org/index.php/server/preprint/view/537"),
  cite("robinson2024", "Robinson 2024: proximity to failure (summary)", "https://biolayne.com/reps/issue-32/the-failure-factor-the-relationship-between-proximity-to-failure-and-strength-and-hypertrophy/"),
  cite("refalo2023", "Refalo 2023: proximity to failure and hypertrophy", "https://openrepository.aut.ac.nz/items/78679612-6ff4-4d00-95d1-7920d072a760/full"),
  cite("singer2024", "Singer 2024: rest intervals", "https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1429789/text"),
  cite("zourdos2016", "Zourdos 2016: RIR-based RPE scale", "https://pubmed.ncbi.nlm.nih.gov/30747900/"),
  cite("bell2023", "Bell 2023: deloading", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10511399/"),
  cite("grgic2020", "Grgic 2020: 1RM test-retest reliability", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7367986/"),
  cite("mitter2022", "Mitter 2022: load-repetition relationship", "https://research.birmingham.ac.uk/en/publications/modeling-the-relationship-between-load-and-repetitions-to-failure/"),
  cite("e1rmReview", "Review of e1RM formulas", "https://arxiv.org/pdf/2603.17495"),
  cite("dots", "DOTS points formula", "https://coachway.io/tools/dots-calculator/"),
  cite("ipfGl", "IPF GL points formula", "https://coachway.io/tools/ipf-gl-points-calculator/"),
  cite("jaric2002", "Jaric 2002: allometric scaling of strength", "https://nsca.com/education/articles/kinetic-select/normalizing-fitness-data"),
  cite("steele2022", "Steele 2022: strength progression follows a linear-log curve", "https://www.strongerbyscience.com/?p=57447"),
  cite("latella2020", "Latella 2020: powerlifting strength progression", "https://pmc.ncbi.nlm.nih.gov/articles/PMC7448836/"),
  cite("latella2023", "Latella 2023 (preprint): powerlifting progression", "https://www.sportrxiv.org/index.php/server/preprint/view/218"),
  cite("swinton2021", "Swinton 2021 (preprint): average strength gain across training studies", "https://sportrxiv.org/index.php/server/preprint/view/11"),
  cite("miller1993", "Miller 1993: sex differences in strength and muscle fiber size", "https://pubmed.ncbi.nlm.nih.gov/8477683/"),
  cite("roberts2020sex", "Roberts, Nuckols & Krieger 2020: sex differences in training adaptations", "https://pubmed.ncbi.nlm.nih.gov/32218059/"),
  cite("refalo2025", "Refalo 2025", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11869894/"),
  cite("peterson2011", "Peterson 2011: age and lean mass gains", "https://pubmed.ncbi.nlm.nih.gov/20543750/"),
  cite("kouri1995", "Kouri 1995: FFMI ceiling [Contested] (via McDonald)", "https://bodyrecomposition.com/muscle-gain/another-look-at-the-ffmi/"),
  cite("harty2019", "Harty 2019: FFMI percentiles in women", "https://digitalcommons.lindenwood.edu/faculty-research-papers/121"),
  cite("hodgdon1984", "Hodgdon & Beckett 1984: US Navy tape body-fat method", "https://apps.dtic.mil/sti/pdfs/ADA143890.pdf"),
  cite("deurenberg", "Deurenberg: BMI-based body fat (never used here)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8980724/"),
  cite("strengthlevel", "StrengthLevel methodology", "https://strengthlevel.com/about"),
  cite("haugen2023", "Haugen 2023: machines vs free weights", "https://pmc.ncbi.nlm.nih.gov/articles/PMC10426227/"),
  cite("acsm2026", "ACSM 2026 resistance-training position stand", "https://www.newswise.com/articles/acsm-unveils-landmark-2026-resistance-training-guidelines-first-update-in-17-years"),
]);

// ───────────────────────────── e1RM / noise (Phase 0) ─────────────────────────────

/** No e1RM estimate when reps + RIR exceeds this (formulas are unreliable above ~10-12; Reynolds 2006). */
export const E1RM_MAX_EFFECTIVE_REPS = 12;
/** Estimates with reps + RIR above this are flagged low-confidence. */
export const E1RM_LOW_CONFIDENCE_ABOVE_REPS = 10;
/** Stored precision of e1rmKg / effectiveLoadKg (Decimal(7,3)). */
export const KG_DP = 3;
/** A change smaller than ~5% is noise: 1RM test-retest CV is ~4% (grgic2020). */
export const NOISE_THRESHOLD = 0.05;
/** Sets above this many reps are excluded from session-best e1RM (formulas are most accurate at <= 10; Reynolds 2006, e1rmReview). */
export const SESSION_E1RM_MAX_REPS = 10;

// ───────────────────────────── volume (schoenfeld2017volume, pelland2025, bazvalle2022) ─────────────────────────────

/** Fractional weighting: a primary-muscle hard set counts 1.0, a secondary-muscle hard set 0.5 (docs/research.md "Training variables"). */
export const PRIMARY_SET_WEIGHT = 1;
export const SECONDARY_SET_WEIGHT = 0.5;
/** A set with RIR above this is not "hard" (RIR 0-4 or unrecorded counts; robinson2024, refalo2023). */
export const HARD_SET_MAX_RIR = 4;

/**
 * Weekly fractional-set bands per muscle by training goal.
 *  HYPERTROPHY 10-20: schoenfeld2017volume, pelland2025, bazvalle2022.
 *  STRENGTH 4-10: "steeper diminishing returns after about 4-10 sets per lift per week" (pelland2025); applied per muscle.
 *  GENERAL 4-20: ASSUMPTION. The research brief has no general-fitness band, so this spans the strength floor to the
 *  hypertrophy ceiling and deliberately flags only very low or very high weeks.
 */
export const VOLUME_BANDS: Record<TrainingGoal, { low: number; high: number }> = {
  HYPERTROPHY: { low: 10, high: 20 },
  STRENGTH: { low: 4, high: 10 },
  GENERAL: { low: 4, high: 20 },
};
/** No goal set: use the hypertrophy default (docs/research.md). */
export const DEFAULT_VOLUME_GOAL: TrainingGoal = "HYPERTROPHY";
/** Per-session ceiling in fractional sets per muscle. A PREPRINT, [Contested] (remmert2025): always labelled so. */
export const SESSION_SET_CAP = 11;

// ───────────────────────────── forecast (steele2022, latella2020, swinton2021) ─────────────────────────────

export const FORECAST_MIN_SESSIONS = 6;
export const FORECAST_MIN_WEEKS = 3;
export const FORECAST_MAX_HORIZON_WEEKS = 12;
/** A gap of this many days or more between sessions ends the fit (layoff reset). */
export const LAYOFF_DAYS = 28;
/** Observation noise: sigma is ~5% of e1RM (grgic2020: 1RM test-retest CV ~4%, plus session-to-session variation). */
export const FORECAST_NOISE_FRACTION = 0.05;
/** Outlier rejection: points further than this many (scaled) MADs from the median are dropped. */
export const OUTLIER_MAD_MULTIPLIER = 3;
/** Scale that turns a MAD into a standard-deviation-like quantity for normal data. */
export const MAD_SCALE = 1.4826;
/** Floor for the MAD as a fraction of the median, so a perfectly flat series does not flag every wobble as an outlier. */
export const MAD_FLOOR_FRACTION = 0.02;
/**
 * Prior mean of the RELATIVE slope per unit of ln(t + t0): e1RM(t) = level0 * (1 + b * (ln(t + t0) - ln t0)).
 * Linear-log shape from steele2022. b = 0.16 is calibrated so that a lifter with t0 = 4 weeks gains ~42% in year 1
 * (Steele: ~30-50%) and one with t0 = 78 weeks ~8% (Latella: 7.5-12.5% in the first competition year; Swinton: 14.3%
 * average across training studies). Sex, age and bodyweight barely change the shape (Steele), so the percent prior is
 * shared (roberts2020sex) and the sex/lift arguments of the forecast do not change it.
 */
export const FORECAST_PRIOR_SLOPE = 0.16;
/** Prior sd of the relative slope: about 3x the mean. Lifters differ a lot (Steele n = 14,690): a few weeks of data must not move the forecast far, while 16 weeks of data can. */
export const FORECAST_PRIOR_SLOPE_SD = 0.5;
/** Prior sd of the (relative) level at t = 0: effectively flat, the data decide the level. */
export const FORECAST_PRIOR_LEVEL_SD = 1;
/**
 * ASSUMPTION anchored to steele2022 ("practically plateaued after 1-2 years"): training age in weeks at the first
 * logged workout, by self-reported experience. t0 grows as the lifter gets older, which flattens ln(t + t0).
 */
export const T0_WEEKS_BY_EXPERIENCE: Record<ExperienceLevel, number> = {
  BEGINNER: 12,
  INTERMEDIATE: 78,
  ADVANCED: 260,
};
/** Unknown experience: assume about half a year of prior training before the first logged workout. */
export const T0_WEEKS_UNKNOWN = 26;
export const T0_WEEKS_MIN = 4;
/** z-scores of a central normal interval: 50% and 80%. */
export const Z_50 = 0.6744897501960817;
export const Z_80 = 1.2815515655446004;

// ───────────────────────────── stall and progression ─────────────────────────────

/** Stall detection compares the best e1RM of the last window with the window before it (noise: grgic2020). */
export const STALL_WINDOW_WEEKS = 6;
export const STALL_MIN_SESSIONS_PER_WINDOW = 2;
/** Double progression, 2-for-2 rule (NSCA, no link yet): the last set beats the target by this many reps ... */
export const TWO_FOR_TWO_EXTRA_REPS = 2;
/** ... in this many sessions in a row. */
export const TWO_FOR_TWO_SESSIONS = 2;
/** Load increments are 2-10% (docs/research.md "Progressing load"). */
export const INCREMENT_MIN_FRACTION = 0.02;
export const INCREMENT_MAX_FRACTION = 0.1;
/** More reps than this before accepting a big machine jump is not sensible: take the jump instead. */
export const BIG_JUMP_MAX_REPS = 20;
/**
 * ASSUMPTION (convention; docs/research.md gives no rep ranges besides ">= 80% of 1RM for strength"): the default
 * double-progression rep range by goal when a series has no template range. Strength 3-6 reps sits at or above ~80%.
 */
export const DEFAULT_REP_RANGE: Record<TrainingGoal, { min: number; max: number }> = {
  HYPERTROPHY: { min: 8, max: 12 },
  STRENGTH: { min: 3, max: 6 },
  GENERAL: { min: 8, max: 12 },
};

// ───────────────────────────── scores ─────────────────────────────

export interface DotsCoefficients {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  minBw: number;
  maxBw: number;
}
/** DOTS (dots): docs/research.md "Relative strength scores". */
export const DOTS_MALE: DotsCoefficients = { a: -307.75076, b: 24.0900756, c: -0.1918759221, d: 0.0007391293, e: -0.000001093, minBw: 40, maxBw: 210 };
export const DOTS_FEMALE: DotsCoefficients = { a: -57.96288, b: 13.6175032, c: -0.1126655495, d: 0.0005158568, e: -0.0000010706, minBw: 40, maxBw: 150 };
export const DOTS_NUMERATOR = 500;

export interface IpfGlCoefficients {
  a: number;
  b: number;
  c: number;
}
/** IPF GL points (ipfGl): classic (raw) and equipped coefficients, docs/research.md. Check value: 90 kg / 700 kg male = 93.06. */
export const IPF_GL_CLASSIC: Record<"MALE" | "FEMALE", IpfGlCoefficients> = {
  MALE: { a: 1199.72839, b: 1025.18162, c: 0.00921 },
  FEMALE: { a: 610.32796, b: 1045.59282, c: 0.03048 },
};
export const IPF_GL_EQUIPPED: Record<"MALE" | "FEMALE", IpfGlCoefficients> = {
  MALE: { a: 1236.25115, b: 1449.21864, c: 0.01644 },
  FEMALE: { a: 758.63878, b: 949.31382, c: 0.02435 },
};
export const IPF_GL_NUMERATOR = 100;

/** Allometric exponent (jaric2002). */
export const ALLOMETRIC_EXPONENT = 0.67;

/** FFMI: normalized = FFMI + 6.1 (1.8 - h); the range is +-4 body-fat points (docs/research.md "Sex, age and body composition"). */
export const FFMI_HEIGHT_REFERENCE_M = 1.8;
export const FFMI_NORMALIZE_COEFFICIENT = 6.1;
export const FFMI_BODY_FAT_RANGE_POINTS = 4;
/** Reference ceilings, NOT verdicts: ~25 men (kouri1995, [Contested]); 97.5th percentile ~23.9 women (harty2019). */
export const FFMI_REFERENCE: Record<"MALE" | "FEMALE", { value: number; label: string; citation: string }> = {
  MALE: { value: 25, label: "a commonly cited drug-free ceiling of about 25 [Contested]", citation: "kouri1995" },
  FEMALE: { value: 23.9, label: "the 97.5th percentile of about 23.9 in women", citation: "harty2019" },
};

/** US Navy tape formula (hodgdon1984), cm and log base 10; standard error ~3.5%. */
export const NAVY = {
  MALE: { a: 1.0324, b: 0.19077, c: 0.15456 },
  FEMALE: { a: 1.29579, b: 0.35004, c: 0.221 },
  numerator: 495,
  offset: 450,
  minPct: 2,
  maxPct: 70,
} as const;
/** Priority of body-fat sources: lower index wins. BMI/Deurenberg is never a source (deurenberg overestimates in lifters). VISUAL is not used. */
export const BODY_FAT_SOURCE_PRIORITY = [["DEXA"], ["BIA", "CALIPERS"], ["NAVY_TAPE"], ["SCALE"]] as const;
/** Stored (non-computed) body-fat percentages outside this range are ignored as data-entry errors. */
export const BODY_FAT_VALID_RANGE = { min: 2, max: 70 } as const;
export const BODYWEIGHT_TREND_HALF_LIFE_DAYS = 7;

/** [Verify] coefficients that must stay OFF until confirmed against a primary source (docs/research.md). */
export const DISABLED_COEFFICIENTS = [
  { id: "ipf-gl-bench-only", reason: "[Verify] bench-only IPF GL coefficients are not implemented" },
  { id: "wilks2", reason: "[Verify] Wilks2 coefficients are not implemented" },
] as const;

// ───────────────────────────── insight rules ─────────────────────────────

export const INSIGHT_WINDOW_WEEKS = 4;
/** effort-check: median recorded RIR at or above this over the window (robinson2024, refalo2023, zourdos2016). */
export const EFFORT_CHECK_MEDIAN_RIR = 4;
export const EFFORT_CHECK_MIN_RECORDED_SETS = 15;
/** volume-band: only muscles with at least this many direct (primary) hard sets in the week are judged. */
export const VOLUME_BAND_MIN_DIRECT_SETS = 2;
/** frequency: a strength-goal lift trained at most this often per week on average gets the "twice a week" nudge (pelland2025). */
export const FREQUENCY_LOW_SESSIONS_PER_WEEK = 1.25;
/** rep-range-goal (schoenfeld2017load): share of working sets that must sit outside the goal's range, and the minimum sample. */
export const REP_RANGE_OFF_SHARE = 0.6;
export const REP_RANGE_MIN_SETS = 20;
/** Strength is better with >= 80% of 1RM, which is roughly <= 7 reps to failure; sets of 11+ reps are well under that. */
export const STRENGTH_GOAL_HIGH_REP_FROM = 11;
/** Hypertrophy is similar from ~30% to 85% of 1RM; sets of 3 reps or fewer are the heavy edge where volume is hard to accumulate. */
export const HYPERTROPHY_GOAL_LOW_REP_TO = 3;
/** cut-strength-drop: bodyweight trend down by this fraction over 4 weeks AND a main lift's best e1RM down by NOISE_THRESHOLD. */
export const CUT_WEIGHT_LOSS_FRACTION_4W = 0.02;
export const CUT_PROTEIN_G_PER_KG = 1.6;
/** Cards never carry more than this many characters of body text (insightCardSchema max is 1200). */
export const CARD_BODY_MAX = 1100;
