// Demo-user seed: `pnpm exec tsx prisma/seed/fixtures.ts` (prisma/seed/index.ts is frozen, so streams F/W3 call this directly).
//
// Creates demo@overload.test through Better Auth's server API (so sign-in works), a complete Profile and the generated
// 16-week history as real rows (catalog exercises by catalogExerciseId, a MachineProfile per machine, workouts, workout
// exercises, sets with derived columns computed via effectiveLoadKg/estimate1RM, sync metadata via bumpSyncVersion +
// syncMixin). Personal records are left for stream E1's rebuild. Idempotent: a re-run replaces this user's rows.
//
// The password is a TEST-ONLY constant for a throwaway demo account on a development/preview database: NEVER seed it into
// production (the script refuses when VERCEL_ENV=production). Set DEMO_PASSWORD to use another one.
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { generateNKeysBetween } from "fractional-indexing";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { estimate1RM } from "@/lib/analytics/e1rm";
import { effectiveLoadKg } from "@/lib/analytics/load";
import { localDateToDate, toLocalDate } from "@/lib/dates";
import { catalogExerciseId, seriesKey } from "@/lib/ids";
import { FIXTURE_DEMO_EMAIL, FIXTURE_TIMEZONE, generateLifterRows, type LifterOptions } from "@/lib/fixtures/generate";
import { FIXTURE_EXERCISE_LIST } from "@/lib/fixtures/exercises";

/** TEST-ONLY. Documented in the header; meets Better Auth's 10-character minimum. */
export const DEMO_PASSWORD_DEFAULT = "overload-demo-only-2026";
export const DEMO_EMAIL = FIXTURE_DEMO_EMAIL;
export const DEMO_NAME = "Demo Lifter";

export interface SeedDemoResult {
  userId: string;
  workouts: number;
  sets: number;
  bodyMetrics: number;
}

/**
 * `server-only` throws under plain Node (tsx). sync-meta.ts is frozen and imports it, so stub the package for this process
 * before loading it (Vitest aliases it the same way).
 */
function stubServerOnly() {
  const stub = pathToFileURL(path.resolve(import.meta.dirname, "../../src/test/server-only-stub.ts")).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === "server-only" ? { url: stub, shortCircuit: true } : nextResolve(specifier, context);
    },
  });
}

async function loadServerModules() {
  stubServerOnly();
  const [{ auth }, syncMeta, { mintUserCtx }] = await Promise.all([
    import("@/server/auth/auth"),
    import("@/server/sync-meta"),
    import("@/server/auth/ctx"),
  ]);
  return { auth, ...syncMeta, mintUserCtx };
}

async function ensureUser(prisma: PrismaClient, auth: Awaited<ReturnType<typeof loadServerModules>>["auth"]): Promise<string> {
  const existing = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
  if (existing) return existing.id;
  try {
    await auth.api.signUpEmail({ body: { name: DEMO_NAME, email: DEMO_EMAIL, password: process.env.DEMO_PASSWORD || DEMO_PASSWORD_DEFAULT } });
  } catch (error) {
    // e.g. the verification email could not be sent: fine as long as the account exists
    const created = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
    if (!created) throw error;
  }
  const user = await prisma.user.findFirst({ where: { email: DEMO_EMAIL } });
  if (!user) throw new Error("demo user was not created");
  // Stream A may require verified email at sign-in; the demo account is pre-verified.
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  return user.id;
}

export async function seedDemoUser(prisma: PrismaClient, options: LifterOptions = {}): Promise<SeedDemoResult> {
  if (process.env.VERCEL_ENV === "production") throw new Error("Refusing to seed the demo user into production.");
  const today = options.today ?? toLocalDate(new Date(), FIXTURE_TIMEZONE);
  const history = generateLifterRows({ ...options, today });
  const { auth, bumpSyncVersion, syncMixin, mintUserCtx } = await loadServerModules();
  const userId = await ensureUser(prisma, auth);
  const ctx = mintUserCtx(userId);

  // The catalog must be seeded (pnpm db:seed). Derived columns use the DB's classification, not the fixture's copy.
  const exercises = await prisma.exercise.findMany({
    where: { id: { in: FIXTURE_EXERCISE_LIST.map((e) => catalogExerciseId(e.sourceId)) } },
  });
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));
  for (const e of FIXTURE_EXERCISE_LIST) {
    if (!exerciseById.has(e.meta.id)) throw new Error(`catalog exercise ${e.sourceId} is missing: run \`pnpm db:seed\` first`);
  }
  const machineById = new Map(history.machineProfiles.map((m) => [m.id, m]));
  const toNum = (d: { toString(): string } | null) => (d == null ? null : Number(d.toString()));

  const counts = { workouts: history.workouts.length, sets: 0, bodyMetrics: history.bodyMetrics.length };
  for (const w of history.workouts) for (const we of w.exercises) counts.sets += we.sets.length;
  const totalRows = history.machineProfiles.length + counts.workouts + history.workouts.reduce((n, w) => n + w.exercises.length, 0) + counts.sets + counts.bodyMetrics;

  await prisma.$transaction(
    async (tx) => {
      // Replace this user's previous demo data (children first; PRs are rebuilt by stream E1).
      await tx.personalRecord.deleteMany({ where: { userId } });
      await tx.workoutSet.deleteMany({ where: { userId } });
      await tx.workoutExercise.deleteMany({ where: { userId } });
      await tx.workout.deleteMany({ where: { userId } });
      await tx.machineProfile.deleteMany({ where: { userId } });
      await tx.bodyMetric.deleteMany({ where: { userId } });

      const birthDate = localDateToDate(history.profile.birthDate!);
      const profile = {
        sex: history.profile.sex, birthDate, heightCm: history.profile.heightCm, unitPreference: history.profile.unitPreference,
        effortScale: "RIR" as const, experience: history.profile.experience, goal: history.profile.goal,
        e1rmFormula: history.profile.e1rmFormula, timezone: history.profile.timezone, defaultRestSec: 120, insightsEnabled: true,
        onboardedAt: localDateToDate(today),
      };
      await tx.profile.upsert({ where: { userId }, create: { userId, ...profile }, update: profile });

      // One unique, increasing version per row (the sync cursor must never skip rows): reserve the whole range at once.
      const first = await bumpSyncVersion(tx, ctx);
      if (totalRows > 1) await tx.syncState.update({ where: { userId }, data: { version: { increment: totalRows - 1 } } });
      let next = first;
      const nowMs = Date.now();
      const mix = (fields: readonly string[]) => syncMixin(next++, fields, nowMs);

      const machineData = history.machineProfiles.map((m) => {
        const data = { name: m.name, gymName: m.gymName, brand: m.brand, exerciseId: m.exerciseId, labelUnit: m.labelUnit, pinStepKg: m.pinStepKg, baseLoadKg: m.baseLoadKg, notes: m.notes };
        return { id: m.id, userId, ...data, ...mix(Object.keys(data)) };
      });
      await tx.machineProfile.createMany({ data: machineData });

      const workoutData = history.workouts.map((w) => {
        const data = { templateId: null, title: w.title, startedAt: new Date(w.startedAt), endedAt: new Date(w.endedAt), localDate: localDateToDate(w.localDate), timezone: w.timezone, bodyweightKg: w.bodyweightKg, isDeload: w.isDeload, notes: null };
        return { id: w.id, userId, ...data, ...mix(Object.keys(data)) };
      });
      await tx.workout.createMany({ data: workoutData });

      const weData = history.workouts.flatMap((w) => {
        const keys = generateNKeysBetween(null, null, w.exercises.length);
        return w.exercises.map((we, i) => {
          const data = { workoutId: w.id, exerciseId: we.exerciseId, machineProfileId: we.machineProfileId, position: keys[i]!, supersetKey: null, restSec: null, notes: null };
          return { id: we.id, userId, ...data, ...mix(Object.keys(data)) };
        });
      });
      await tx.workoutExercise.createMany({ data: weData });

      const setData = history.workouts.flatMap((w) =>
        w.exercises.flatMap((we) => {
          const ex = exerciseById.get(we.exerciseId)!;
          const machine = we.machineProfileId ? machineById.get(we.machineProfileId) : undefined;
          const keys = generateNKeysBetween(null, null, we.sets.length);
          return we.sets.map((s, i) => {
            const eff = effectiveLoadKg({
              loadType: ex.loadType, weightKg: s.weightKg, isUnilateral: ex.isUnilateral, bodyweightKg: w.bodyweightKg,
              bodyweightFactor: toNum(ex.bodyweightFactor), baseLoadKg: machine?.baseLoadKg ?? null,
            });
            const e1rm = eff != null ? estimate1RM({ weightKg: eff, reps: s.reps, rir: s.rir })?.e1rmKg ?? null : null;
            const data = {
              position: keys[i]!, setType: s.setType, weightKg: s.weightKg, inputUnit: s.inputUnit, reps: s.reps, rir: s.rir,
              durationSec: null, distanceM: null, completedAt: new Date(s.completedAt), notes: null,
            };
            return {
              id: s.id, userId, workoutExerciseId: we.id, workoutId: w.id, exerciseId: we.exerciseId, machineProfileId: we.machineProfileId,
              seriesKey: seriesKey(we.exerciseId, we.machineProfileId), localDate: localDateToDate(w.localDate), effectiveLoadKg: eff, e1rmKg: e1rm,
              ...data, ...mix(Object.keys(data)),
            };
          });
        }),
      );
      for (let i = 0; i < setData.length; i += 500) await tx.workoutSet.createMany({ data: setData.slice(i, i + 500) });

      const bodyData = history.bodyMetrics.map((m) => {
        const data = {
          measuredAt: new Date(m.measuredAt), localDate: localDateToDate(m.localDate), weightKg: m.weightKg, bodyFatPct: null, bodyFatMethod: null,
          neckCm: m.neckCm, waistCm: m.waistCm, hipCm: m.hipCm, chestCm: null, armCm: null, thighCm: null, calfCm: null, notes: null,
        };
        return { id: m.id, userId, ...data, ...mix(Object.keys(data)) };
      });
      await tx.bodyMetric.createMany({ data: bodyData });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  return { userId, ...counts };
}

async function main() {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Set DIRECT_URL or DATABASE_URL in .env.local before seeding.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const result = await seedDemoUser(prisma);
    console.log(`Seeded ${DEMO_EMAIL}: ${result.workouts} workouts, ${result.sets} sets, ${result.bodyMetrics} body metrics.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    () => process.exit(0),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
