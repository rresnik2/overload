// InsightFacts (input to the narrative) and InsightNarrative (Claude's structured output). FROZEN after Phase 0.
// Builders/consumers: D builds facts (buildWeeklyFacts), G persists + narrates, F/Wave 3 render cards.
import { z } from "zod";
import { INSIGHT_RULE_IDS, INSIGHT_SEVERITIES } from "./analytics";
import { localDateSchema, isoDateTimeSchema } from "./entities";
import {
  experienceLevelSchema,
  insightStatusSchema,
  insightTriggerSchema,
  modalitySchema,
  muscleSchema,
  prTypeSchema,
  sexSchema,
  standardLiftSchema,
  trainingGoalSchema,
  weightUnitSchema,
} from "./enums";

export const INSIGHT_FACTS_VERSION = 1;

const num = z.number().finite();
const factId = z.string().min(1).max(160);

export const insightEvidenceSchema = z.strictObject({
  label: z.string().min(1).max(120),
  value: z.union([z.string().max(200), num]),
  unit: z.string().max(20).optional(),
});

export const insightCardSchema = z.strictObject({
  id: factId,
  ruleId: z.enum(INSIGHT_RULE_IDS),
  severity: z.enum(INSIGHT_SEVERITIES),
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(1200),
  evidence: z.array(insightEvidenceSchema).max(12),
  citations: z.array(z.string().max(60)).max(8),
  subject: z
    .strictObject({
      seriesKey: z.string().optional(),
      exerciseId: z.string().optional(),
      muscle: muscleSchema.optional(),
    })
    .optional(),
});

/**
 * The ONLY numbers the narrative may use. Every object that can be cited carries an `id`; the narrative cites ids in
 * `factRefs`. All numeric values the model writes must appear in this JSON (checked by stream G's grounding test).
 * Kilogram values are canonical; `displayUnit` says what the user sees.
 */
export const insightFactsSchema = z.strictObject({
  version: z.literal(INSIGHT_FACTS_VERSION),
  weekStart: localDateSchema,
  weekEnd: localDateSchema,
  timezone: z.string().min(1).max(64),
  displayUnit: weightUnitSchema,
  lifter: z.strictObject({
    id: z.literal("lifter"),
    sex: sexSchema.nullable(),
    ageYears: z.int().nullable(),
    heightCm: num.nullable(),
    experience: experienceLevelSchema.nullable(),
    goal: trainingGoalSchema.nullable(),
    bodyweightKg: num.nullable(),
    bodyFatPct: num.nullable(),
    weeksTraining: z.int().nullable(),
  }),
  training: z.strictObject({
    id: z.literal("training"),
    sessions: z.int(),
    trainingDays: z.array(localDateSchema),
    completedSets: z.int(),
    hardSets: z.int(),
    volumeLoadKg: num,
    avgRir: num.nullable(),
    isDeloadWeek: z.boolean(),
    sessionsPrevWeek: z.int(),
    hardSetsPrevWeek: z.int(),
  }),
  /** id: `volume:<MUSCLE>` */
  volume: z.array(
    z.strictObject({
      id: factId,
      muscle: muscleSchema,
      fractionalSets: num,
      priorWeekFractionalSets: num.nullable(),
      bandLow: num,
      bandHigh: num,
      status: z.enum(["none", "below", "within", "above"]),
    }),
  ),
  /** id: `lift:<seriesKey>`. One per progression series trained in the last 8 weeks (machine series stay separate). */
  lifts: z.array(
    z.strictObject({
      id: factId,
      seriesKey: z.string(),
      exerciseId: z.string(),
      name: z.string().max(200),
      modality: modalitySchema,
      machineLabel: z.string().max(200).nullable(),
      standardLift: standardLiftSchema.nullable(),
      e1rmKg: num.nullable(),
      e1rmChangePct4w: num.nullable(),
      bestSet: z.strictObject({ weightKg: num, reps: z.int() }).nullable(),
      sessionsLast8w: z.int(),
      trend: z.enum(["up", "flat", "down", "insufficient"]),
      stalled: z.boolean(),
      forecast: z
        .strictObject({
          horizonWeeks: z.int(),
          p50Kg: num,
          low80Kg: num,
          high80Kg: num,
        })
        .nullable(),
    }),
  ),
  /** id: `pr:<seriesKey>:<type>:<reps>` */
  prs: z.array(
    z.strictObject({
      id: factId,
      seriesKey: z.string(),
      exerciseName: z.string().max(200),
      type: prTypeSchema,
      reps: z.int(),
      value: num,
      previousValue: num.nullable(),
      achievedOn: localDateSchema,
    }),
  ),
  /** id: "body" */
  body: z
    .strictObject({
      id: z.literal("body"),
      weightKg: num.nullable(),
      weightTrendKg: num.nullable(),
      weightChangeKg4w: num.nullable(),
      bodyFatPct: num.nullable(),
      bodyFatMethod: z.string().nullable(),
      ffmi: num.nullable(),
      normalizedFfmi: num.nullable(),
    })
    .nullable(),
  /** Output of the rule engine; ids are `insight:<ruleId>[:<subject>]`. */
  insights: z.array(insightCardSchema),
});
export type InsightFacts = z.infer<typeof insightFactsSchema>;

/** Structured output requested from Claude (stream G). At most 3 actions; every section cites facts by id. */
export const insightNarrativeSchema = z.strictObject({
  headline: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(1200),
  sections: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(80),
        body: z.string().trim().min(1).max(1200),
        factRefs: z.array(factId).min(1).max(12),
      }),
    )
    .min(1)
    .max(5),
  actions: z
    .array(
      z.strictObject({
        text: z.string().trim().min(1).max(240),
        factRefs: z.array(factId).max(6),
      }),
    )
    .max(3),
});
export type InsightNarrative = z.infer<typeof insightNarrativeSchema>;

/** Every citable fact id in a facts bundle (for validating narrative factRefs). Implemented. */
export function collectFactIds(facts: InsightFacts): Set<string> {
  const ids = new Set<string>([facts.lifter.id, facts.training.id]);
  for (const v of facts.volume) ids.add(v.id);
  for (const l of facts.lifts) ids.add(l.id);
  for (const p of facts.prs) ids.add(p.id);
  if (facts.body) ids.add(facts.body.id);
  for (const i of facts.insights) ids.add(i.id);
  return ids;
}

/** What /insights and the LatestInsightCard read (mapped from the InsightReport table by stream G). */
export interface InsightReportRow {
  id: string;
  weekStart: string;
  status: z.infer<typeof insightStatusSchema>;
  trigger: z.infer<typeof insightTriggerSchema>;
  factsVersion: number;
  facts: InsightFacts;
  factsHash: string;
  narrative: InsightNarrative | null;
  model: string | null;
  promptVersion: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
  onDemandCount: number;
  generatedAt: z.infer<typeof isoDateTimeSchema> | null;
}

/** Signature of the pure facts builder (src/lib/analytics/facts.ts, stream D). */
export type BuildWeeklyFacts = (
  input: import("./analytics").AnalyticsInput,
  opts: { weekStart: string },
) => InsightFacts;
