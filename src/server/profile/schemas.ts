// Strict input schemas for the profile / onboarding Server Actions. No `userId`: the action always uses the session user.
import { z } from "zod";
import { experienceLevelSchema, sexSchema, trainingGoalSchema, weightUnitSchema } from "@/contracts/enums";
import { localDateSchema, profileUpdateSchema } from "@/contracts/entities";
import { ageInYears, isValidLocalDate, isValidTimeZone, toLocalDate } from "@/lib/dates";

const timezoneSchema = z.string().min(1).max(64).refine(isValidTimeZone, "Pick a valid time zone");

/** Settings > Profile: the frozen contract schema plus a time-zone check. */
export const profileFormSchema = profileUpdateSchema.refine((value) => value.timezone === undefined || isValidTimeZone(value.timezone), {
  message: "Pick a valid time zone",
  path: ["timezone"],
});

export const MIN_AGE_YEARS = 13;
export const MAX_AGE_YEARS = 110;

/** The onboarding wizard's final submit. Weight is already kg (the wizard converts at the UI edge). */
export const onboardingSchema = z
  .strictObject({
    sex: sexSchema,
    birthDate: localDateSchema,
    heightCm: z.number().min(50).max(260),
    unitPreference: weightUnitSchema,
    experience: experienceLevelSchema,
    goal: trainingGoalSchema,
    timezone: timezoneSchema,
    weightKg: z.number().min(20).max(500),
    bodyFatPct: z.number().min(1).max(75).nullable().default(null),
  })
  .superRefine((value, ctx) => {
    // Field-level failures (bad zone / malformed date) are already reported; do not compute an age from them.
    if (!isValidTimeZone(value.timezone) || !isValidLocalDate(value.birthDate)) return;
    const age = ageInYears(value.birthDate, toLocalDate(new Date(), value.timezone));
    if (age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: `Enter a birth date between ${MIN_AGE_YEARS} and ${MAX_AGE_YEARS} years ago` });
    }
  });
export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingData = z.output<typeof onboardingSchema>;

/** Typed confirmation for account deletion. */
export const DELETE_CONFIRMATION = "delete my account";
export const deleteAccountSchema = z.strictObject({
  confirmation: z.string().trim().toLowerCase().pipe(z.literal(DELETE_CONFIRMATION, `Type "${DELETE_CONFIRMATION}" to confirm`)),
  password: z.string().min(1).max(256).optional(),
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
