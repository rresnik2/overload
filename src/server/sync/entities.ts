import "server-only";
// Per-entity adapters for the generic sync code: which Prisma delegate to use, how to turn a Prisma row into a wire
// Row (via the frozen mappers) and how to turn merged wire values back into Prisma data (Date objects; Decimal columns
// accept plain numbers). Everything here is keyed by EntityName so apply/pull/gc stay entity-agnostic.
import type { Prisma } from "@/generated/prisma/client";
import { ENTITY_WRITABLE_FIELDS, type EntityName, type SyncMeta } from "@/contracts/entities";
import { localDateToDate } from "@/lib/dates";
import type { FieldValues } from "@/lib/sync/merge";
import {
  bodyMetricToRow,
  exerciseToRow,
  machineProfileToRow,
  templateExerciseToRow,
  templateToRow,
  workoutExerciseToRow,
  workoutSetToRow,
  workoutToRow,
} from "@/server/mappers";

export type Tx = Prisma.TransactionClient;
export type DbRow = Record<string, unknown>;
export type WireRow = { id: string } & SyncMeta & Record<string, unknown>;

/** The slice of a Prisma model delegate the generic sync code needs (one cast per entity below). */
export interface RowDelegate {
  findMany(args: Record<string, unknown>): Promise<DbRow[]>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface EntityAdapter {
  name: EntityName;
  delegate(db: Tx): RowDelegate;
  include?: Record<string, unknown>;
  toRow(row: DbRow): WireRow;
}

const as = <T>(value: unknown) => value as T;

export const ADAPTERS: { [E in EntityName]: EntityAdapter } = {
  exercise: {
    name: "exercise",
    delegate: (db) => as<RowDelegate>(db.exercise),
    include: { muscles: true },
    toRow: (r) => as<WireRow>(exerciseToRow(as(r))),
  },
  machineProfile: {
    name: "machineProfile",
    delegate: (db) => as<RowDelegate>(db.machineProfile),
    toRow: (r) => as<WireRow>(machineProfileToRow(as(r))),
  },
  bodyMetric: {
    name: "bodyMetric",
    delegate: (db) => as<RowDelegate>(db.bodyMetric),
    toRow: (r) => as<WireRow>(bodyMetricToRow(as(r))),
  },
  template: {
    name: "template",
    delegate: (db) => as<RowDelegate>(db.template),
    toRow: (r) => as<WireRow>(templateToRow(as(r))),
  },
  templateExercise: {
    name: "templateExercise",
    delegate: (db) => as<RowDelegate>(db.templateExercise),
    toRow: (r) => as<WireRow>(templateExerciseToRow(as(r))),
  },
  workout: {
    name: "workout",
    delegate: (db) => as<RowDelegate>(db.workout),
    toRow: (r) => as<WireRow>(workoutToRow(as(r))),
  },
  workoutExercise: {
    name: "workoutExercise",
    delegate: (db) => as<RowDelegate>(db.workoutExercise),
    toRow: (r) => as<WireRow>(workoutExerciseToRow(as(r))),
  },
  workoutSet: {
    name: "workoutSet",
    delegate: (db) => as<RowDelegate>(db.workoutSet),
    toRow: (r) => as<WireRow>(workoutSetToRow(as(r))),
  },
};

const INSTANT_FIELDS: Partial<Record<EntityName, readonly string[]>> = {
  bodyMetric: ["measuredAt"],
  workout: ["startedAt", "endedAt"],
  workoutSet: ["completedAt"],
};
const DATE_FIELDS: Partial<Record<EntityName, readonly string[]>> = {
  bodyMetric: ["localDate"],
  workout: ["localDate"],
};

/** The merge-state values of a row: its writable fields plus `deletedAt` (in wire form). */
export function rowValues(entity: EntityName, row: WireRow): FieldValues {
  const out: FieldValues = {};
  for (const field of [...ENTITY_WRITABLE_FIELDS[entity], "deletedAt"]) out[field] = row[field];
  return out;
}

/** Merged wire values -> Prisma column data. `muscles` is not a column (ExerciseMuscle rows are materialized separately). */
export function toDbData(entity: EntityName, values: FieldValues): Record<string, unknown> {
  const instants = INSTANT_FIELDS[entity] ?? [];
  const dates = DATE_FIELDS[entity] ?? [];
  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (field === "muscles") continue;
    if (value == null) data[field] = null;
    else if (field === "deletedAt" || instants.includes(field)) data[field] = new Date(value as string);
    else if (dates.includes(field)) data[field] = localDateToDate(value as string);
    else data[field] = value;
  }
  return data;
}

export function fieldHlcOf(row: DbRow): Record<string, string> {
  const raw = row.fieldHlc;
  const out: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  }
  return out;
}
