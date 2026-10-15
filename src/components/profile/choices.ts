import type { ExperienceLevel, Sex, TrainingGoal, WeightUnit } from "@/contracts/enums";
import type { Choice } from "./ChoiceGroup";

export const UNIT_CHOICES: readonly Choice<WeightUnit>[] = [
  { value: "KG", label: "Kilograms", hint: "kg, cm" },
  { value: "LB", label: "Pounds", hint: "lb, ft and in" },
];

export const SEX_CHOICES: readonly Choice<Sex>[] = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say", hint: "Hides percentiles" },
];

export const EXPERIENCE_CHOICES: readonly Choice<ExperienceLevel>[] = [
  { value: "BEGINNER", label: "Beginner", hint: "Under about a year of steady lifting" },
  { value: "INTERMEDIATE", label: "Intermediate", hint: "One to three years" },
  { value: "ADVANCED", label: "Advanced", hint: "More than three years" },
];

export const GOAL_CHOICES: readonly Choice<TrainingGoal>[] = [
  { value: "HYPERTROPHY", label: "Build muscle" },
  { value: "STRENGTH", label: "Get stronger" },
  { value: "GENERAL", label: "General fitness" },
  { value: "FAT_LOSS", label: "Lose weight (keep muscle)" },
];

export interface GoalCardInfo {
  value: TrainingGoal;
  title: string;
  /** What you are optimizing. */
  summary: string;
  /** What choosing it changes in Overload: targets, defaults and which insights show. */
  changes: string;
  term: "goalHypertrophy" | "goalStrength" | "goalGeneral" | "goalFatLoss";
}

/** The four goal cards (onboarding and Settings). The numbers match VOLUME_BANDS / DEFAULT_REP_RANGE in src/lib/analytics/constants.ts. */
export const GOAL_CARDS: readonly GoalCardInfo[] = [
  {
    value: "HYPERTROPHY",
    title: "Build muscle",
    summary: "Grow bigger muscles.",
    changes: "Targets about 10 to 20 hard sets per muscle a week, reps mostly 8 to 12, and most sets 0 to 3 reps short of failure.",
    term: "goalHypertrophy",
  },
  {
    value: "STRENGTH",
    title: "Get stronger",
    summary: "Lift heavier weights.",
    changes: "Targets about 4 to 10 sets per muscle a week, low reps (3 to 6) on main lifts, long rests, and nudges you to train each lift twice a week.",
    term: "goalStrength",
  },
  {
    value: "GENERAL",
    title: "General fitness",
    summary: "Stay strong and capable.",
    changes: "A wide, forgiving range of 4 to 20 sets per muscle a week. Insights only flag weeks that are very light or very heavy.",
    term: "goalGeneral",
  },
  {
    value: "FAT_LOSS",
    title: "Lose weight",
    summary: "Lose weight and keep your muscle.",
    changes: "Keeps your sets and heavy lifting steady, and tracks how fast your weight is falling: about 0.5 to 1% of bodyweight a week is the usual range.",
    term: "goalFatLoss",
  },
];
