import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as analytics from "./analytics";
import * as catalog from "./catalog";
import * as entities from "./entities";
import * as enums from "./enums";
import {
  FIXTURE_HLC,
  FIXTURE_IDS,
  exampleInsightFacts,
  exampleInsightNarrative,
  exampleSyncRequest,
  exampleSyncResponse,
} from "./fixtures";
import * as insights from "./insights";
import * as sync from "./sync";
import {
  ENTITY_FIELDS_SCHEMAS,
  ENTITY_NAMES,
  ENTITY_PATCH_SCHEMAS,
  ENTITY_REFS,
  ENTITY_WRITABLE_FIELDS,
  SERVER_OWNED_FIELDS,
  SYNC_ORDER,
  WORKOUT_SET_DERIVED_FIELDS,
  exerciseFieldsSchema,
  patchOf,
  profileUpdateSchema,
  workoutSetFieldsSchema,
  workoutSetPatchSchema,
} from "./entities";
import { collectFactIds, insightFactsSchema, insightNarrativeSchema } from "./insights";
import { SYNC_MAX_MUTATIONS, compareHlc, emptyChanges, isHlc, mutationSchema, syncRequestSchema } from "./sync";

/** Every key reachable inside a Zod schema (objects, arrays, unions, optionals, defaults, pipes). */
function collectKeys(schema: z.ZodType, seen = new Set<z.ZodType>()): Set<string> {
  const keys = new Set<string>();
  const visit = (s: z.ZodType) => {
    if (seen.has(s)) return;
    seen.add(s);
    if (s instanceof z.ZodObject) {
      for (const [k, v] of Object.entries(s.shape)) {
        keys.add(k);
        visit(v as z.ZodType);
      }
    } else if (s instanceof z.ZodArray) visit(s.element as z.ZodType);
    else if (s instanceof z.ZodOptional || s instanceof z.ZodNullable || s instanceof z.ZodDefault) visit(s.unwrap() as z.ZodType);
    else if (s instanceof z.ZodUnion || s instanceof z.ZodDiscriminatedUnion) for (const o of s.options) visit(o as z.ZodType);
    else if (s instanceof z.ZodRecord) visit(s.valueType as z.ZodType);
  };
  visit(schema);
  return keys;
}

describe("enum mirrors", () => {
  it("every enum has a schema, a values list and an entry in ALL_ENUMS", () => {
    expect(Object.keys(enums.ALL_ENUMS)).toHaveLength(21);
    for (const [name, values] of Object.entries(enums.ALL_ENUMS)) {
      expect(Object.keys(values).sort(), name).toEqual(Object.values(values).sort());
    }
  });
});

describe("entity schemas", () => {
  it("never accept server-owned or server-derived fields as writable", () => {
    for (const name of ENTITY_NAMES) {
      const writable = ENTITY_WRITABLE_FIELDS[name];
      for (const forbidden of SERVER_OWNED_FIELDS) expect(writable, `${name}.${forbidden}`).not.toContain(forbidden);
    }
    for (const forbidden of WORKOUT_SET_DERIVED_FIELDS) {
      expect(ENTITY_WRITABLE_FIELDS.workoutSet, forbidden).not.toContain(forbidden);
    }
  });

  it("no schema anywhere in the contracts declares a userId field", () => {
    const all: [string, z.ZodType][] = [];
    for (const mod of [entities, analytics, catalog, insights, sync] as Record<string, unknown>[]) {
      for (const [name, value] of Object.entries(mod)) if (value instanceof z.ZodType) all.push([name, value]);
    }
    expect(all.length).toBeGreaterThan(20);
    for (const [name, schema] of all) expect(collectKeys(schema).has("userId"), name).toBe(false);
  });

  it("rejects unknown keys instead of stripping them (userId, version, effectiveLoadKg, e1rmKg, localDate on sets)", () => {
    const set = { workoutExerciseId: FIXTURE_IDS.workoutExercise, position: "a0" };
    expect(workoutSetFieldsSchema.safeParse(set).success).toBe(true);
    for (const extra of ["userId", "version", "hlc", "fieldHlc", "effectiveLoadKg", "e1rmKg", "seriesKey", "localDate", "workoutId", "exerciseId"]) {
      expect(workoutSetFieldsSchema.safeParse({ ...set, [extra]: "x" }).success, extra).toBe(false);
    }
  });

  it("applies defaults when creating but never when patching", () => {
    const created = workoutSetFieldsSchema.parse({ workoutExerciseId: FIXTURE_IDS.workoutExercise, position: "a0" });
    expect(created.setType).toBe("WORKING");
    expect(created.weightKg).toBeNull();
    expect(workoutSetPatchSchema.parse({})).toEqual({});
    expect(workoutSetPatchSchema.parse({ reps: 6 })).toEqual({ reps: 6 });
    for (const name of ENTITY_NAMES) expect(ENTITY_PATCH_SCHEMAS[name].parse({}), name).toEqual({});
  });

  it("patchOf strips defaults but keeps validation", () => {
    const patch = patchOf(exerciseFieldsSchema);
    expect(patch.parse({ name: "Leg Press" })).toEqual({ name: "Leg Press" });
    expect(patch.safeParse({ modality: "NOT_A_MODALITY" }).success).toBe(false);
  });

  it("validates ranges and formats", () => {
    expect(workoutSetFieldsSchema.safeParse({ workoutExerciseId: "nope", position: "a0" }).success).toBe(false);
    expect(workoutSetFieldsSchema.safeParse({ workoutExerciseId: FIXTURE_IDS.workoutExercise, position: "a0", reps: -1 }).success).toBe(false);
    expect(workoutSetFieldsSchema.safeParse({ workoutExerciseId: FIXTURE_IDS.workoutExercise, position: "a0", rir: 11 }).success).toBe(false);
    expect(
      workoutSetFieldsSchema.safeParse({ workoutExerciseId: FIXTURE_IDS.workoutExercise, position: "a0", completedAt: "2026-10-12" }).success,
    ).toBe(false);
  });

  it("machine profile platesKg: an optional list of up to 20 plate weights (0-100 kg), null by default", () => {
    const base = { name: "Home bar" };
    expect(entities.machineProfileFieldsSchema.parse(base).platesKg).toBeNull();
    expect(entities.machineProfileFieldsSchema.parse({ ...base, platesKg: [25, 1.25, 0.5] }).platesKg).toEqual([25, 1.25, 0.5]);
    expect(entities.machineProfileFieldsSchema.parse({ ...base, platesKg: null }).platesKg).toBeNull();
    expect(entities.machineProfileFieldsSchema.safeParse({ ...base, platesKg: Array.from({ length: 21 }, () => 5) }).success).toBe(false);
    expect(entities.machineProfileFieldsSchema.safeParse({ ...base, platesKg: [101] }).success).toBe(false);
    expect(entities.machineProfileFieldsSchema.safeParse({ ...base, platesKg: [-1] }).success).toBe(false);
    expect(entities.machineProfilePatchSchema.parse({ platesKg: [20] })).toEqual({ platesKg: [20] });
    expect(entities.machineProfilePatchSchema.parse({})).toEqual({});
  });

  it("profile updates are strict and have no userId", () => {
    expect(profileUpdateSchema.safeParse({ unitPreference: "LB", heightCm: 180 }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ userId: "someone-else" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ heightCm: 5 }).success).toBe(false);
  });

  it("registry is consistent: sync order, refs and schemas cover the 9 entities", () => {
    expect(ENTITY_NAMES).toHaveLength(9);
    expect(ENTITY_NAMES).toContain("exerciseFavorite");
    expect(SYNC_ORDER).toEqual([...ENTITY_NAMES]);
    expect(Object.keys(ENTITY_FIELDS_SCHEMAS).sort()).toEqual([...ENTITY_NAMES].sort());
    // every reference points at an entity that is synced BEFORE it (parents first) and at a real writable field
    for (const name of ENTITY_NAMES) {
      for (const ref of ENTITY_REFS[name]) {
        expect(ENTITY_NAMES.indexOf(ref.entity), `${name}.${ref.field}`).toBeLessThan(ENTITY_NAMES.indexOf(name));
        expect(ENTITY_WRITABLE_FIELDS[name]).toContain(ref.field);
      }
    }
  });
});

describe("exerciseFavorite contract", () => {
  const exerciseId = "83a024cb-efa6-5b1b-8cef-e115a267bd5b";

  it("writable fields are exerciseId and position (plus deletedAt on the wire); everything else is rejected, not stripped", () => {
    expect(ENTITY_WRITABLE_FIELDS.exerciseFavorite).toEqual(["exerciseId", "position"]);
    expect(ENTITY_FIELDS_SCHEMAS.exerciseFavorite.safeParse({ exerciseId, position: "a0" }).success).toBe(true);
    expect(ENTITY_FIELDS_SCHEMAS.exerciseFavorite.safeParse({ position: "a0" }).success).toBe(false); // exerciseId is required on create
    for (const forbidden of ["userId", "version", "hlc", "fieldHlc", "id", "deletedAt"]) {
      expect(ENTITY_FIELDS_SCHEMAS.exerciseFavorite.safeParse({ exerciseId, position: "a0", [forbidden]: "x" }).success, forbidden).toBe(false);
    }
    expect(ENTITY_PATCH_SCHEMAS.exerciseFavorite.safeParse({ position: "a1" }).success).toBe(true);
    expect(ENTITY_PATCH_SCHEMAS.exerciseFavorite.safeParse({ userId: "x" }).success).toBe(false);
  });

  it("references the exercise (catalog or custom) as a required parent", () => {
    expect(ENTITY_REFS.exerciseFavorite).toEqual([{ field: "exerciseId", entity: "exercise", required: true }]);
  });

  it("is a valid mutation (create, unstar, restore) and appears in SyncChanges", () => {
    const base = { mutationId: "0192a5b0-0005-7000-8000-000000000001", entity: "exerciseFavorite", id: "3b170bbb-fc8d-5451-ab92-7df1100dcdc0" };
    const create = { ...base, fields: { exerciseId, position: "a0" }, fieldHlc: { exerciseId: FIXTURE_HLC, position: FIXTURE_HLC } };
    expect(mutationSchema.safeParse(create).success).toBe(true);
    expect(mutationSchema.safeParse({ ...base, fields: { deletedAt: "2026-10-15T10:00:00.000Z" }, fieldHlc: { deletedAt: FIXTURE_HLC } }).success).toBe(true);
    expect(mutationSchema.safeParse({ ...base, fields: { deletedAt: null }, fieldHlc: { deletedAt: FIXTURE_HLC } }).success).toBe(true);
    expect(mutationSchema.safeParse({ ...create, fields: { ...create.fields, userId: "u" }, fieldHlc: { ...create.fieldHlc, userId: FIXTURE_HLC } }).success).toBe(false);
    expect(emptyChanges().exerciseFavorite).toEqual([]);
  });
});

describe("sync contract", () => {
  it("accepts the example request and enforces the batch limit", () => {
    expect(syncRequestSchema.safeParse(exampleSyncRequest).success).toBe(true);
    const tooMany = { ...exampleSyncRequest, mutations: Array(SYNC_MAX_MUTATIONS + 1).fill(exampleSyncRequest.mutations[0]) };
    expect(syncRequestSchema.safeParse(tooMany).success).toBe(false);
  });

  it("rejects mutations with forbidden fields, mismatched fieldHlc, or bad HLCs", () => {
    const base = exampleSyncRequest.mutations[1];
    expect(mutationSchema.safeParse(base).success).toBe(true);
    expect(mutationSchema.safeParse({ ...base, fields: { reps: 6, userId: "x" }, fieldHlc: { reps: FIXTURE_HLC, userId: FIXTURE_HLC } }).success).toBe(false);
    expect(mutationSchema.safeParse({ ...base, fields: { effectiveLoadKg: 100 }, fieldHlc: { effectiveLoadKg: FIXTURE_HLC } }).success).toBe(false);
    expect(mutationSchema.safeParse({ ...base, fieldHlc: {} }).success).toBe(false); // field without an HLC
    expect(mutationSchema.safeParse({ ...base, fieldHlc: { reps: FIXTURE_HLC, weightKg: FIXTURE_HLC } }).success).toBe(false); // HLC without a field
    expect(mutationSchema.safeParse({ ...base, fieldHlc: { reps: "not-an-hlc" } }).success).toBe(false);
    expect(mutationSchema.safeParse({ ...base, entity: "personalRecord" }).success).toBe(false);
  });

  it("deletes are tombstone field writes", () => {
    const del = {
      mutationId: FIXTURE_IDS.mutation,
      entity: "workout",
      id: FIXTURE_IDS.workout,
      fields: { deletedAt: "2026-10-13T00:00:00.000Z" },
      fieldHlc: { deletedAt: FIXTURE_HLC },
    };
    expect(mutationSchema.safeParse(del).success).toBe(true);
    expect(mutationSchema.safeParse({ ...del, fields: { deletedAt: null } }).success).toBe(true); // undelete
  });

  it("HLC strings compare lexicographically", () => {
    expect(isHlc(FIXTURE_HLC)).toBe(true);
    expect(isHlc("1-2-3")).toBe(false);
    expect(compareHlc("", FIXTURE_HLC)).toBe(-1);
    expect(compareHlc("001791990000000-0000a-dev1a2b3", "001791990000000-00009-dev1a2b3")).toBe(1);
    expect(compareHlc("001791990000000-00000-aaa", "001791990000000-00000-bbb")).toBe(-1);
  });

  it("the example response has an entry per entity and one result per mutation", () => {
    expect(Object.keys(exampleSyncResponse.changes).sort()).toEqual([...ENTITY_NAMES].sort());
    expect(exampleSyncResponse.results).toHaveLength(exampleSyncRequest.mutations.length);
    expect(Object.values(emptyChanges()).every((rows) => rows.length === 0)).toBe(true);
  });
});

describe("insight contracts", () => {
  it("validates the example facts and narrative", () => {
    expect(insightFactsSchema.safeParse(exampleInsightFacts).success).toBe(true);
    expect(insightNarrativeSchema.safeParse(exampleInsightNarrative).success).toBe(true);
  });

  it("caps actions at 3 and requires cited facts in every section", () => {
    const action = { text: "Do it.", factRefs: [] };
    expect(insightNarrativeSchema.safeParse({ ...exampleInsightNarrative, actions: [action, action, action, action] }).success).toBe(false);
    expect(
      insightNarrativeSchema.safeParse({
        ...exampleInsightNarrative,
        sections: [{ title: "x", body: "y", factRefs: [] }],
      }).success,
    ).toBe(false);
  });

  it("every factRef in the example narrative resolves to a fact id", () => {
    const ids = collectFactIds(exampleInsightFacts);
    for (const s of exampleInsightNarrative.sections) for (const r of s.factRefs) expect(ids.has(r), r).toBe(true);
    for (const a of exampleInsightNarrative.actions) for (const r of a.factRefs) expect(ids.has(r), r).toBe(true);
  });

  it("facts reject unknown keys (the model is only shown what the schema allows)", () => {
    expect(insightFactsSchema.safeParse({ ...exampleInsightFacts, userId: "x" }).success).toBe(false);
  });
});
