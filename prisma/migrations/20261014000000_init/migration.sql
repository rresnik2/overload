-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LB');

-- CreateEnum
CREATE TYPE "EffortScale" AS ENUM ('RIR', 'RPE');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingGoal" AS ENUM ('HYPERTROPHY', 'STRENGTH', 'GENERAL');

-- CreateEnum
CREATE TYPE "BodyFatMethod" AS ENUM ('SCALE', 'BIA', 'DEXA', 'NAVY_TAPE', 'CALIPERS', 'VISUAL');

-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('FREE_WEIGHT', 'MACHINE', 'CABLE', 'BODYWEIGHT', 'BAND', 'OTHER');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('BARBELL', 'DUMBBELL', 'KETTLEBELL', 'EZ_BAR', 'TRAP_BAR', 'PLATE', 'MEDICINE_BALL', 'SMITH_MACHINE', 'MACHINE_SELECTORIZED', 'MACHINE_PLATE_LOADED', 'CABLE', 'BODYWEIGHT', 'BAND', 'EXERCISE_BALL', 'FOAM_ROLL', 'OTHER');

-- CreateEnum
CREATE TYPE "LoadType" AS ENUM ('TOTAL', 'PER_IMPLEMENT', 'PLATES_PER_SIDE', 'STACK', 'BODYWEIGHT_PLUS', 'NONE');

-- CreateEnum
CREATE TYPE "TrackingType" AS ENUM ('LOAD_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION');

-- CreateEnum
CREATE TYPE "Mechanic" AS ENUM ('COMPOUND', 'ISOLATION');

-- CreateEnum
CREATE TYPE "Force" AS ENUM ('PUSH', 'PULL', 'STATIC');

-- CreateEnum
CREATE TYPE "ExerciseCategory" AS ENUM ('STRENGTH', 'POWERLIFTING', 'OLYMPIC_WEIGHTLIFTING', 'STRONGMAN', 'PLYOMETRICS', 'STRETCHING', 'CARDIO');

-- CreateEnum
CREATE TYPE "Muscle" AS ENUM ('ABDOMINALS', 'ABDUCTORS', 'ADDUCTORS', 'BICEPS', 'CALVES', 'CHEST', 'FOREARMS', 'GLUTES', 'HAMSTRINGS', 'LATS', 'LOWER_BACK', 'MIDDLE_BACK', 'NECK', 'QUADRICEPS', 'SHOULDERS', 'TRAPS', 'TRICEPS');

-- CreateEnum
CREATE TYPE "MuscleRole" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateEnum
CREATE TYPE "StandardLift" AS ENUM ('SQUAT', 'BENCH_PRESS', 'DEADLIFT', 'OVERHEAD_PRESS', 'BARBELL_ROW', 'PULL_UP', 'DIP');

-- CreateEnum
CREATE TYPE "SetType" AS ENUM ('WARMUP', 'WORKING', 'DROP', 'AMRAP');

-- CreateEnum
CREATE TYPE "PrType" AS ENUM ('E1RM', 'MAX_LOAD', 'REP_MAX', 'MAX_REPS', 'MAX_SET_VOLUME', 'MAX_SESSION_VOLUME');

-- CreateEnum
CREATE TYPE "E1rmFormula" AS ENUM ('EPLEY', 'BRZYCKI');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "InsightTrigger" AS ENUM ('CRON', 'ON_DEMAND');

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL,
    "sex" "Sex",
    "birthDate" DATE,
    "heightCm" DECIMAL(5,1),
    "unitPreference" "WeightUnit" NOT NULL DEFAULT 'KG',
    "effortScale" "EffortScale" NOT NULL DEFAULT 'RIR',
    "experience" "ExperienceLevel",
    "goal" "TrainingGoal",
    "e1rmFormula" "E1rmFormula" NOT NULL DEFAULT 'EPLEY',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultRestSec" INTEGER NOT NULL DEFAULT 120,
    "insightsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "gcFloorVersion" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "SyncDeadLetter" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogMeta" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exercise" (
    "id" UUID NOT NULL,
    "userId" TEXT,
    "sourceId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[],
    "modality" "Modality" NOT NULL,
    "equipment" "Equipment" NOT NULL,
    "loadType" "LoadType" NOT NULL,
    "tracking" "TrackingType" NOT NULL DEFAULT 'LOAD_REPS',
    "bodyweightFactor" DECIMAL(3,2),
    "isUnilateral" BOOLEAN NOT NULL DEFAULT false,
    "mechanic" "Mechanic",
    "force" "Force",
    "level" "ExperienceLevel",
    "category" "ExerciseCategory" NOT NULL,
    "standardLift" "StandardLift",
    "instructions" TEXT[],
    "images" TEXT[],
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseMuscle" (
    "exerciseId" UUID NOT NULL,
    "muscle" "Muscle" NOT NULL,
    "role" "MuscleRole" NOT NULL,

    CONSTRAINT "ExerciseMuscle_pkey" PRIMARY KEY ("exerciseId","muscle")
);

-- CreateTable
CREATE TABLE "MachineProfile" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gymName" TEXT,
    "brand" TEXT,
    "exerciseId" UUID,
    "labelUnit" "WeightUnit",
    "pinStepKg" DECIMAL(6,3),
    "baseLoadKg" DECIMAL(6,2),
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MachineProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BodyMetric" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "localDate" DATE NOT NULL,
    "weightKg" DECIMAL(6,2),
    "bodyFatPct" DECIMAL(4,1),
    "bodyFatMethod" "BodyFatMethod",
    "neckCm" DECIMAL(5,1),
    "waistCm" DECIMAL(5,1),
    "hipCm" DECIMAL(5,1),
    "chestCm" DECIMAL(5,1),
    "armCm" DECIMAL(5,1),
    "thighCm" DECIMAL(5,1),
    "calfCm" DECIMAL(5,1),
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "folder" TEXT,
    "position" TEXT NOT NULL,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateExercise" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "machineProfileId" UUID,
    "position" TEXT NOT NULL,
    "warmupSets" INTEGER NOT NULL DEFAULT 0,
    "workingSets" INTEGER NOT NULL DEFAULT 3,
    "repMin" INTEGER,
    "repMax" INTEGER,
    "targetRir" DECIMAL(3,1),
    "restSec" INTEGER,
    "supersetKey" TEXT,
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" UUID,
    "title" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "localDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL,
    "bodyweightKg" DECIMAL(6,2),
    "isDeload" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutExercise" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "machineProfileId" UUID,
    "position" TEXT NOT NULL,
    "supersetKey" TEXT,
    "restSec" INTEGER,
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutSet" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutExerciseId" UUID NOT NULL,
    "workoutId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "machineProfileId" UUID,
    "seriesKey" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "effectiveLoadKg" DECIMAL(7,3),
    "e1rmKg" DECIMAL(7,3),
    "position" TEXT NOT NULL,
    "setType" "SetType" NOT NULL DEFAULT 'WORKING',
    "weightKg" DECIMAL(7,3),
    "inputUnit" "WeightUnit",
    "reps" INTEGER,
    "rir" DECIMAL(3,1),
    "durationSec" INTEGER,
    "distanceM" DECIMAL(9,2),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalRecord" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" UUID NOT NULL,
    "machineProfileId" UUID,
    "seriesKey" TEXT NOT NULL,
    "type" "PrType" NOT NULL,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "value" DECIMAL(12,3) NOT NULL,
    "previousValue" DECIMAL(12,3),
    "setId" UUID,
    "workoutId" UUID NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" "InsightStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "InsightTrigger" NOT NULL,
    "factsVersion" INTEGER NOT NULL,
    "facts" JSONB NOT NULL,
    "factsHash" TEXT NOT NULL,
    "narrative" JSONB,
    "model" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "onDemandCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3),
    "aaguid" TEXT,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncDeadLetter_userId_createdAt_idx" ON "SyncDeadLetter"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_sourceId_key" ON "Exercise"("sourceId");

-- CreateIndex
CREATE INDEX "Exercise_modality_equipment_idx" ON "Exercise"("modality", "equipment");

-- CreateIndex
CREATE INDEX "Exercise_userId_version_idx" ON "Exercise"("userId", "version");

-- CreateIndex
CREATE INDEX "ExerciseMuscle_muscle_role_idx" ON "ExerciseMuscle"("muscle", "role");

-- CreateIndex
CREATE INDEX "MachineProfile_userId_exerciseId_idx" ON "MachineProfile"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "MachineProfile_userId_version_idx" ON "MachineProfile"("userId", "version");

-- CreateIndex
CREATE INDEX "BodyMetric_userId_localDate_idx" ON "BodyMetric"("userId", "localDate");

-- CreateIndex
CREATE INDEX "BodyMetric_userId_version_idx" ON "BodyMetric"("userId", "version");

-- CreateIndex
CREATE INDEX "Template_userId_version_idx" ON "Template"("userId", "version");

-- CreateIndex
CREATE INDEX "TemplateExercise_templateId_position_idx" ON "TemplateExercise"("templateId", "position");

-- CreateIndex
CREATE INDEX "TemplateExercise_userId_version_idx" ON "TemplateExercise"("userId", "version");

-- CreateIndex
CREATE INDEX "Workout_userId_localDate_idx" ON "Workout"("userId", "localDate");

-- CreateIndex
CREATE INDEX "Workout_userId_version_idx" ON "Workout"("userId", "version");

-- CreateIndex
CREATE INDEX "WorkoutExercise_workoutId_position_idx" ON "WorkoutExercise"("workoutId", "position");

-- CreateIndex
CREATE INDEX "WorkoutExercise_userId_exerciseId_idx" ON "WorkoutExercise"("userId", "exerciseId");

-- CreateIndex
CREATE INDEX "WorkoutExercise_userId_version_idx" ON "WorkoutExercise"("userId", "version");

-- CreateIndex
CREATE INDEX "WorkoutSet_userId_exerciseId_localDate_idx" ON "WorkoutSet"("userId", "exerciseId", "localDate");

-- CreateIndex
CREATE INDEX "WorkoutSet_userId_seriesKey_completedAt_idx" ON "WorkoutSet"("userId", "seriesKey", "completedAt");

-- CreateIndex
CREATE INDEX "WorkoutSet_userId_localDate_idx" ON "WorkoutSet"("userId", "localDate");

-- CreateIndex
CREATE INDEX "WorkoutSet_workoutExerciseId_position_idx" ON "WorkoutSet"("workoutExerciseId", "position");

-- CreateIndex
CREATE INDEX "WorkoutSet_userId_version_idx" ON "WorkoutSet"("userId", "version");

-- CreateIndex
CREATE INDEX "PersonalRecord_userId_achievedAt_idx" ON "PersonalRecord"("userId", "achievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalRecord_userId_seriesKey_type_reps_key" ON "PersonalRecord"("userId", "seriesKey", "type", "reps");

-- CreateIndex
CREATE INDEX "InsightReport_status_createdAt_idx" ON "InsightReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InsightReport_userId_weekStart_key" ON "InsightReport"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "passkey_userId_idx" ON "passkey"("userId");

-- CreateIndex
CREATE INDEX "passkey_credentialID_idx" ON "passkey"("credentialID");

-- CreateIndex
CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncDeadLetter" ADD CONSTRAINT "SyncDeadLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseMuscle" ADD CONSTRAINT "ExerciseMuscle_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineProfile" ADD CONSTRAINT "MachineProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MachineProfile" ADD CONSTRAINT "MachineProfile_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BodyMetric" ADD CONSTRAINT "BodyMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateExercise" ADD CONSTRAINT "TemplateExercise_machineProfileId_fkey" FOREIGN KEY ("machineProfileId") REFERENCES "MachineProfile"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutExercise" ADD CONSTRAINT "WorkoutExercise_machineProfileId_fkey" FOREIGN KEY ("machineProfileId") REFERENCES "MachineProfile"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "WorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkoutSet" ADD CONSTRAINT "WorkoutSet_machineProfileId_fkey" FOREIGN KEY ("machineProfileId") REFERENCES "MachineProfile"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_machineProfileId_fkey" FOREIGN KEY ("machineProfileId") REFERENCES "MachineProfile"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalRecord" ADD CONSTRAINT "PersonalRecord_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightReport" ADD CONSTRAINT "InsightReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

