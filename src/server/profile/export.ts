import "server-only";
// JSON export of everything the user owns. Built with the frozen mappers, so Decimals are numbers and rows never carry
// `userId`. Account-level data is limited to name/email, the sign-in method names and passkey labels: never password
// hashes, OAuth tokens, session tokens or public keys.
import type { BodyMetric, Exercise, ExerciseFavorite, ExerciseMuscle, MachineProfile, PersonalRecord, Profile, Template, TemplateExercise, Workout, WorkoutExercise, WorkoutSet } from "@/generated/prisma/client";
import type {
  BodyMetricRow,
  ExerciseFavoriteRow,
  ExerciseRow,
  MachineProfileRow,
  PersonalRecordRow,
  ProfileRow,
  TemplateExerciseRow,
  TemplateRow,
  WorkoutExerciseRow,
  WorkoutRow,
  WorkoutSetRow,
} from "@/contracts/entities";
import type { UserCtx } from "@/server/auth/ctx";
import { prisma } from "@/server/db";
import {
  bodyMetricToRow,
  exerciseFavoriteToRow,
  exerciseToRow,
  isoOrNull,
  iso,
  localDate,
  machineProfileToRow,
  personalRecordToRow,
  profileToRow,
  templateExerciseToRow,
  templateToRow,
  workoutExerciseToRow,
  workoutSetToRow,
  workoutToRow,
} from "@/server/mappers";

export const EXPORT_FORMAT_VERSION = 1;

export interface AccountExportSource {
  user: { name: string; email: string; createdAt: Date };
  accounts: { providerId: string; createdAt: Date }[];
  passkeys: { name: string | null; deviceType: string; createdAt: Date | null }[];
  profile: Profile | null;
  customExercises: (Exercise & { muscles: ExerciseMuscle[] })[];
  machineProfiles: MachineProfile[];
  exerciseFavorites: ExerciseFavorite[];
  bodyMetrics: BodyMetric[];
  templates: Template[];
  templateExercises: TemplateExercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  workoutSets: WorkoutSet[];
  personalRecords: PersonalRecord[];
  insightReports: { weekStart: Date; status: string; trigger: string; narrative: unknown; facts: unknown; generatedAt: Date | null }[];
}

export interface AccountExport {
  formatVersion: number;
  exportedAt: string;
  account: {
    name: string;
    email: string;
    createdAt: string;
    signInMethods: string[];
    passkeys: { name: string | null; deviceType: string; createdAt: string | null }[];
  };
  profile: ProfileRow | null;
  customExercises: ExerciseRow[];
  machineProfiles: MachineProfileRow[];
  exerciseFavorites: ExerciseFavoriteRow[];
  bodyMetrics: BodyMetricRow[];
  templates: TemplateRow[];
  templateExercises: TemplateExerciseRow[];
  workouts: WorkoutRow[];
  workoutExercises: WorkoutExerciseRow[];
  workoutSets: WorkoutSetRow[];
  personalRecords: PersonalRecordRow[];
  insightReports: { weekStart: string; status: string; trigger: string; narrative: unknown; facts: unknown; generatedAt: string | null }[];
}

/** Pure: Prisma rows -> the export document. */
export function buildAccountExport(source: AccountExportSource, now: Date = new Date()): AccountExport {
  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: iso(now),
    account: {
      name: source.user.name,
      email: source.user.email,
      createdAt: iso(source.user.createdAt),
      signInMethods: [...new Set(source.accounts.map((a) => (a.providerId === "credential" ? "password" : a.providerId)))].sort(),
      passkeys: source.passkeys.map((p) => ({ name: p.name, deviceType: p.deviceType, createdAt: isoOrNull(p.createdAt) })),
    },
    profile: source.profile ? profileToRow(source.profile) : null,
    customExercises: source.customExercises.map(exerciseToRow),
    machineProfiles: source.machineProfiles.map(machineProfileToRow),
    exerciseFavorites: source.exerciseFavorites.map(exerciseFavoriteToRow),
    bodyMetrics: source.bodyMetrics.map(bodyMetricToRow),
    templates: source.templates.map(templateToRow),
    templateExercises: source.templateExercises.map(templateExerciseToRow),
    workouts: source.workouts.map(workoutToRow),
    workoutExercises: source.workoutExercises.map(workoutExerciseToRow),
    workoutSets: source.workoutSets.map(workoutSetToRow),
    personalRecords: source.personalRecords.map(personalRecordToRow),
    insightReports: source.insightReports.map((r) => ({
      weekStart: localDate(r.weekStart),
      status: r.status,
      trigger: r.trigger,
      narrative: r.narrative ?? null,
      facts: r.facts ?? null,
      generatedAt: isoOrNull(r.generatedAt),
    })),
  };
}

/** Live (not tombstoned) rows only: deleted data is not part of "your data". */
export async function loadAccountExportSource(ctx: UserCtx): Promise<AccountExportSource> {
  const userId = ctx.id;
  const live = { userId, deletedAt: null };
  const [user, accounts, passkeys, profile, customExercises, machineProfiles, exerciseFavorites, bodyMetrics, templates, templateExercises, workouts, workoutExercises, workoutSets, personalRecords, insightReports] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
      prisma.account.findMany({ where: { userId }, select: { providerId: true, createdAt: true } }),
      prisma.passkey.findMany({ where: { userId }, select: { name: true, deviceType: true, createdAt: true } }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.exercise.findMany({ where: live, include: { muscles: true }, orderBy: { createdAt: "asc" } }),
      prisma.machineProfile.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.exerciseFavorite.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.bodyMetric.findMany({ where: live, orderBy: { measuredAt: "asc" } }),
      prisma.template.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.templateExercise.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.workout.findMany({ where: live, orderBy: { startedAt: "asc" } }),
      prisma.workoutExercise.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.workoutSet.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.personalRecord.findMany({ where: { userId }, orderBy: { achievedAt: "asc" } }),
      prisma.insightReport.findMany({
        where: { userId },
        orderBy: { weekStart: "asc" },
        select: { weekStart: true, status: true, trigger: true, narrative: true, facts: true, generatedAt: true },
      }),
    ]);
  return { user, accounts, passkeys, profile, customExercises, machineProfiles, exerciseFavorites, bodyMetrics, templates, templateExercises, workouts, workoutExercises, workoutSets, personalRecords, insightReports };
}

export async function exportAccountData(ctx: UserCtx): Promise<AccountExport> {
  return buildAccountExport(await loadAccountExportSource(ctx));
}
