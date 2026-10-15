// The one glossary behind every hint in the app (InfoHint, Term, PageIntro). PURE (no react).
// Rules for `short`: plain language, second person, at most two sentences and GLOSSARY_MAX_LENGTH characters, and no
// jargon inside the explanation that is not itself explained. A test (glossary.test.ts) enforces length, sentence count,
// the `learn` links and that every TermId used in the UI exists here.

/** Public /learn articles a hint may link to (src/app/(marketing)/learn/<slug>). */
export type LearnSlug =
  | "rir"
  | "e1rm"
  | "volume-landmarks"
  | "machine-vs-free-weight"
  | "hypertrophy-vs-hyperplasia"
  | "choosing-a-goal";

export interface GlossaryEntry {
  /** The name shown in the popover heading and in "What is {term}?". */
  term: string;
  /** The explanation. */
  short: string;
  /** Optional deeper read: a /learn article. */
  learn?: LearnSlug;
}

export const GLOSSARY_MAX_LENGTH = 200;

const entries = {
  // ───────────── effort
  rir: {
    term: "Reps in reserve (RIR)",
    short: "How many more reps you could have done when you stopped. 0 means you couldn't do another; 3 means you stopped with three left.",
    learn: "rir",
  },
  rpe: {
    term: "RPE",
    short: "The same effort scale turned around: RPE 10 means nothing left, RPE 7 means three reps left. Overload stores it as reps in reserve, so you can switch any time.",
    learn: "rir",
  },
  targetRir: {
    term: "Target RIR",
    short: "How close to your limit you plan to take a set. For muscle growth, 0 to 3 reps left on most sets works well.",
    learn: "rir",
  },
  failure: {
    term: "Failure",
    short: "The point where you can't finish another rep with good form. Training close to it works well, but going all the way adds little.",
    learn: "rir",
  },
  hardSet: {
    term: "Hard set",
    short: "A finished set that isn't a warm-up and ends within four reps of your limit (or has no effort logged). Only hard sets count toward your weekly sets.",
    learn: "volume-landmarks",
  },
  proximityToFailure: {
    term: "Proximity to failure",
    short: "How near to your limit a set ends. Closer is a little better for growth, but the last reps add little and cost extra recovery.",
    learn: "rir",
  },

  // ───────────── sets
  warmupSet: {
    term: "Warm-up set",
    short: "A lighter set to prepare for your heavy work. It's saved but never counts toward weekly sets, records or your strength estimate.",
  },
  workingSet: {
    term: "Working set",
    short: "A set at the weight and effort you planned for the exercise. These are the sets that count toward your progress.",
  },
  dropSet: {
    term: "Drop set",
    short: "A set done straight after a heavy one with a lighter weight, so you can keep going while tired. It counts toward weekly sets but not toward records.",
  },
  amrap: {
    term: "AMRAP",
    short: "As many reps as possible. You go until you can't do another good rep instead of stopping at a set number.",
  },
  superset: {
    term: "Superset",
    short: "Two or more exercises done back to back with little rest between them. Give them the same group key and Overload shows them together.",
  },
  topSet: {
    term: "Top set",
    short: "Your best working set of an exercise in a session, by estimated max. The progress charts follow it from session to session.",
    learn: "e1rm",
  },
  restTimer: {
    term: "Rest timer",
    short: "Counts down your rest between sets and starts when you finish a set. Heavy lifts usually need 2 to 5 minutes.",
  },
  setType: {
    term: "Set type",
    short: "Working is a normal set. Warm-up, drop set and AMRAP change how the set counts, so tap it to switch.",
  },
  repRange: {
    term: "Rep range",
    short: "The reps you aim for, like 8 to 12. Reach the top of the range on every set, then add weight.",
  },
  restSeconds: {
    term: "Rest",
    short: "How long to rest after this set, in seconds. The rest timer uses it when you finish the set.",
  },
  template: {
    term: "Template",
    short: "A saved workout plan with its exercises, sets, rep ranges and rest. Start one to fill in a new workout for you.",
  },

  // ───────────── load labels
  loadLabel: {
    term: "Load label",
    short: "Says what the weight you type means for this exercise: the total, per hand, per side, a stack number, or on top of your bodyweight.",
  },
  loadTotal: {
    term: "Total weight",
    short: "The full weight you lift: the bar and plates together, or a single weight.",
  },
  loadPerHand: {
    term: "Per hand",
    short: "The weight of one dumbbell or kettlebell, not the pair. Hold two 20 kg dumbbells and you log 20; Overload counts both.",
  },
  loadPerSide: {
    term: "Per side",
    short: "The plates on one side of the bar or machine, not both. Overload adds the other side and the machine's own weight if you've entered it.",
  },
  loadStack: {
    term: "Stack number",
    short: "The pin position or number on a weight stack. It differs between machines, so it's never compared with free weights.",
    learn: "machine-vs-free-weight",
  },
  bodyweightPlus: {
    term: "Bodyweight + added load",
    short: "Extra weight on top of your own, like a belt on pull-ups. Enter 0 for bodyweight alone.",
  },
  assisted: {
    term: "Assisted lifts",
    short: "On an assisted pull-up or dip machine the number is help, not load: a bigger number means an easier rep. Charts read a higher number as heavier, so these lifts look backwards.",
  },
  machineWeights: {
    term: "Why machine weights differ",
    short: "The same number feels different on different machines because of their levers, cams and friction. So each machine gets its own progress line.",
    learn: "machine-vs-free-weight",
  },
  lastTime: {
    term: "Last time",
    short: "The grey numbers are what you did for this exercise last time. Tap the check to log the same, or type something new.",
  },
  machineProfile: {
    term: "Machine profile",
    short: "A named machine at a gym, like \"Leg press at Home Gym\". Your leg press at two gyms is two separate progressions, because their weights can't be compared.",
    learn: "machine-vs-free-weight",
  },
  machineChooser: {
    term: "Machine",
    short: "Pick the machine you're using, or add one. Progress is tracked per machine so numbers are only compared like with like.",
    learn: "machine-vs-free-weight",
  },

  // ───────────── progress
  e1rm: {
    term: "Estimated one-rep max (e1RM)",
    short: "A guess at the heaviest single rep you could do, worked out from your weight, reps and reps in reserve. It lets you compare sets of different weights and reps.",
    learn: "e1rm",
  },
  forecast: {
    term: "Forecast",
    short: "Where your estimated max could be in a few weeks, based on your own trend and typical progress. It's a guess, not a promise.",
    learn: "e1rm",
  },
  forecastBands: {
    term: "Forecast bands",
    short: "The darker band is where about half of outcomes should land; the lighter band holds about four in five. A wide band means the forecast is unsure.",
    learn: "e1rm",
  },
  forecastNeedsSessions: {
    term: "Needs 6 sessions",
    short: "A forecast needs at least 6 sessions spread over 3 weeks. With less, one great or bad day would swing the line too much.",
    learn: "e1rm",
  },
  volumeLoad: {
    term: "Volume load",
    short: "Weight times reps, added up over your sets. A rough measure of the total work you did.",
  },
  weeklySets: {
    term: "Weekly sets per muscle",
    short: "How many hard sets each muscle got this week. A set where the muscle is the main mover counts 1; where it only helps, 0.5.",
    learn: "volume-landmarks",
  },
  fractionalSets: {
    term: "Fractional sets",
    short: "Sets counted by how much a muscle did. A main-mover set counts 1 and a helper set counts 0.5, so a bench press gives your triceps half a set.",
    learn: "volume-landmarks",
  },
  targetBand: {
    term: "Target band",
    short: "The range of weekly sets that works well for your goal. For building muscle it's about 10 to 20 per muscle; going far past it adds little.",
    learn: "volume-landmarks",
  },
  personalRecord: {
    term: "Personal record (PR)",
    short: "Your best ever in a category, like heaviest weight or most reps. Each exercise (and each machine) has its own records.",
  },
  prE1rm: {
    term: "Best estimated max",
    short: "Your highest estimated one-rep max for this exercise, whatever weight and reps got you there.",
    learn: "e1rm",
  },
  prMaxLoad: {
    term: "Heaviest weight",
    short: "The most weight you've lifted for at least one rep.",
  },
  prRepMax: {
    term: "Rep max",
    short: "The most weight you've lifted for an exact number of reps, like your best 5-rep set.",
  },
  prMaxReps: {
    term: "Most reps",
    short: "The most reps you've done in one set. This is the record that matters for bodyweight work.",
  },
  prSetVolume: {
    term: "Best set volume",
    short: "The biggest weight times reps in a single set.",
  },
  prSessionVolume: {
    term: "Best session volume",
    short: "The most weight times reps added up over one workout for this exercise.",
  },
  deload: {
    term: "Deload",
    short: "A planned easier week, with lighter weights or fewer sets, so tiredness can fade. Deload weeks are left out of your trends and forecasts.",
  },
  stall: {
    term: "Stall",
    short: "When your estimated max hasn't improved for several sessions in a row. A deload, a new rep range or a different variation usually gets it moving.",
  },
  doubleProgression: {
    term: "Double progression",
    short: "Add reps first, then weight. Once you beat your rep target by two on the last set in two sessions in a row, it's time to add weight.",
  },
  progressSeries: {
    term: "Progress series",
    short: "Each exercise, and each machine you use for it, has its own series and its own chart. Pick one to see its history.",
    learn: "machine-vs-free-weight",
  },
  rateOfLoss: {
    term: "Rate of weight change",
    short: "How fast your bodyweight trend moves, as a percent of bodyweight per week. About 0.5 to 1% a week is the pace suggested for losing weight while keeping muscle.",
    learn: "choosing-a-goal",
  },

  // ───────────── insights
  insightSeverity: {
    term: "Insight labels",
    short: "Info is context, Suggestion is something to try, Heads up is worth your attention, and Win is progress to enjoy.",
  },
  insightEvidence: {
    term: "Evidence",
    short: "The numbers from your own logs that this insight is based on, so you can check it yourself.",
  },

  // ───────────── body
  bodyweightTrend: {
    term: "Bodyweight trend",
    short: "A smoothed line through your weigh-ins. Daily weight jumps around with water and food, so the trend shows the real direction.",
  },
  bodyFatMethods: {
    term: "Body-fat methods",
    short: "Methods differ in accuracy: a DEXA scan is the best, a scale is the roughest. Overload uses the most accurate one you've logged.",
  },
  navyTape: {
    term: "Navy tape method",
    short: "Estimates body fat from tape measurements of your waist and neck (plus hips if you enter them) and your height. It's usually within about 3.5 percentage points.",
  },
  ffmi: {
    term: "Fat-free mass index (FFMI)",
    short: "Your lean mass compared with your height. Body-fat estimates are rough, so Overload shows a range instead of one number.",
  },
  dots: {
    term: "DOTS",
    short: "A score that compares total strength across bodyweights. It only applies to the barbell squat, bench press and deadlift.",
  },

  // ───────────── app
  modalityTabs: {
    term: "Free weight, machine, cable, bodyweight",
    short: "How an exercise is loaded. They're tracked separately because a machine or cable number can't be compared with a barbell's.",
    learn: "machine-vs-free-weight",
  },
  favorites: {
    term: "Favorites",
    short: "Star an exercise to keep it at the top of your lists and in the picker when you add exercises.",
  },
  syncStatus: {
    term: "Sync status",
    short: "Synced means saved to your account; offline means saved on this device and sent when you're back online. Error or signed out needs your attention.",
  },
  units: {
    term: "Units",
    short: "Choose kg or lb for what you see and type. Everything is stored in kilograms, so switching never changes your data.",
  },
  effortScale: {
    term: "Effort scale",
    short: "Choose how you rate effort: reps in reserve (0 to 4) or RPE (10 to 6). They mean the same thing, so you can switch any time.",
    learn: "rir",
  },
  e1rmFormula: {
    term: "e1RM formula",
    short: "The maths that turns a set into an estimated max. Epley is a fine default; Brzycki gives slightly different numbers, mostly at higher reps.",
    learn: "e1rm",
  },
  trainingGoal: {
    term: "Training goal",
    short: "What you mainly want from training. It sets your weekly set targets, default rep ranges and what insights focus on, and you can change it any time.",
    learn: "choosing-a-goal",
  },
  goalHypertrophy: {
    term: "Build muscle",
    short: "Grow muscle size. Aim for about 10 to 20 hard sets per muscle a week, mostly 8 to 12 reps, with most sets stopping 0 to 3 reps short of your limit.",
    learn: "choosing-a-goal",
  },
  goalStrength: {
    term: "Get stronger",
    short: "Lift heavier weights. Keep reps low (about 3 to 6) on your main lifts, rest 2 to 5 minutes, and train each lift at least twice a week.",
    learn: "choosing-a-goal",
  },
  goalGeneral: {
    term: "General fitness",
    short: "Stay strong and capable without chasing one number. A wide, forgiving range of weekly sets works, and every other goal still applies a little.",
    learn: "choosing-a-goal",
  },
  goalFatLoss: {
    term: "Lose weight (keep muscle)",
    short: "Lose weight while keeping the muscle you have. Keep lifting heavy and keep your sets steady; food intake, not training, drives the weight loss.",
    learn: "choosing-a-goal",
  },
  experienceLevel: {
    term: "Experience level",
    short: "How long you've trained seriously. Newer lifters progress faster, so it sets what Overload expects in forecasts and comparisons.",
  },
  sex: {
    term: "Sex",
    short: "Used only to pick the right body-fat formulas and strength norms, which differ between sexes. You can skip it.",
  },
  bodyStats: {
    term: "Age and height",
    short: "Used only for formulas like lean-mass index and for strength norms. They stay in your account.",
  },
  timezone: {
    term: "Time zone",
    short: "Used to decide which day a workout belongs to, so a late-night session lands on the right date.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof entries;
export const GLOSSARY: Record<TermId, GlossaryEntry> = entries;
export const TERM_IDS = Object.keys(entries) as TermId[];

export function glossaryEntry(id: TermId): GlossaryEntry {
  return GLOSSARY[id];
}
