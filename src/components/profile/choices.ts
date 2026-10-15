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
];
