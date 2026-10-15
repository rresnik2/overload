import { describe, expect, it } from "vitest";
import type { ExerciseClassification } from "@/contracts/catalog";
import {
  equipmentSchema,
  exerciseCategorySchema,
  experienceLevelSchema,
  loadTypeSchema,
  modalitySchema,
  muscleSchema,
  standardLiftSchema,
  trackingTypeSchema,
  type Equipment,
  type LoadType,
  type Modality,
  type StandardLift,
  type TrackingType,
} from "@/contracts/enums";
import { catalogExerciseId } from "@/lib/ids";
import { loadSourceRows } from "./catalog";
import { OVERRIDDEN_IDS, classify, classifyByRules } from "./classify";
import overrides from "./overrides.json";
import { STARTER_LABELS } from "./starter-exercises";

const rows = loadSourceRows();
const byId = new Map(rows.map((r) => [r.id, r]));
const all = rows.map((r) => classify(r));
const get = (id: string): ExerciseClassification => {
  const row = byId.get(id);
  if (!row) throw new Error(`not in dataset: ${id}`);
  return classify(row);
};

describe("every source row is classified", () => {
  it("covers all 876 rows without throwing and with valid enums", () => {
    expect(rows).toHaveLength(876);
    expect(all).toHaveLength(876);
    for (const c of all) {
      expect(modalitySchema.safeParse(c.modality).success, c.sourceId).toBe(true);
      expect(equipmentSchema.safeParse(c.equipment).success, c.sourceId).toBe(true);
      expect(loadTypeSchema.safeParse(c.loadType).success, c.sourceId).toBe(true);
      expect(trackingTypeSchema.safeParse(c.tracking).success, c.sourceId).toBe(true);
      expect(exerciseCategorySchema.safeParse(c.category).success, c.sourceId).toBe(true);
      expect(experienceLevelSchema.safeParse(c.level).success, c.sourceId).toBe(true);
      if (c.standardLift) expect(standardLiftSchema.safeParse(c.standardLift).success, c.sourceId).toBe(true);
      expect(c.name.length, c.sourceId).toBeGreaterThan(0);
      expect(c.slug.length, c.sourceId).toBeGreaterThan(0);
    }
  });

  it("keeps muscles: at least one primary where the dataset has one, valid unique muscles", () => {
    for (const row of rows) {
      const c = classify(row);
      const muscles = c.muscles.map((m) => m.muscle);
      expect(new Set(muscles).size, row.id).toBe(muscles.length);
      for (const m of muscles) expect(muscleSchema.safeParse(m).success, row.id).toBe(true);
      if (row.primaryMuscles.length > 0) expect(c.muscles.some((m) => m.role === "PRIMARY"), row.id).toBe(true);
    }
  });

  it("maps the dataset's `expert` level to ADVANCED", () => {
    const expert = rows.find((r) => r.level === "expert");
    expect(expert).toBeDefined();
    expect(classify(expert!).level).toBe("ADVANCED");
  });
});

interface Golden {
  id: string;
  modality: Modality;
  equipment: Equipment;
  loadType: LoadType;
  tracking?: TrackingType;
  unilateral?: boolean;
  bodyweightFactor?: number;
  standardLift?: StandardLift;
}

// Labelled by reading each exercise (name + instructions), not by running the classifier. The first 30 are the Phase 0
// starter labels (STARTER_LABELS); the extras below cover the other branches of the rules.
const EXTRAS: Golden[] = [
  { id: "Trap_Bar_Deadlift", modality: "FREE_WEIGHT", equipment: "TRAP_BAR", loadType: "TOTAL" },
  { id: "Smith_Machine_Squat", modality: "MACHINE", equipment: "SMITH_MACHINE", loadType: "TOTAL" },
  { id: "One-Arm_Dumbbell_Row", modality: "FREE_WEIGHT", equipment: "DUMBBELL", loadType: "PER_IMPLEMENT", unilateral: true },
  { id: "EZ-Bar_Curl", modality: "FREE_WEIGHT", equipment: "EZ_BAR", loadType: "TOTAL" },
  { id: "Leverage_High_Row", modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" },
  { id: "Thigh_Abductor", modality: "MACHINE", equipment: "MACHINE_SELECTORIZED", loadType: "STACK" },
  { id: "Cable_One_Arm_Tricep_Extension", modality: "CABLE", equipment: "CABLE", loadType: "STACK", unilateral: true },
  { id: "Band_Pull_Apart", modality: "BAND", equipment: "BAND", loadType: "NONE", tracking: "REPS" },
  { id: "Running_Treadmill", modality: "MACHINE", equipment: "OTHER", loadType: "NONE", tracking: "DISTANCE_DURATION" },
  { id: "Incline_Push-Up", modality: "BODYWEIGHT", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", bodyweightFactor: 0.41 },
];

describe("hand-labelled exercises (40)", () => {
  const goldens: Golden[] = [
    ...Object.entries(STARTER_LABELS).map(([id, l]) => ({
      id,
      modality: l.modality,
      equipment: l.equipment,
      loadType: l.loadType,
      tracking: l.tracking,
      unilateral: l.isUnilateral,
      bodyweightFactor: l.bodyweightFactor,
      standardLift: l.standardLift,
    })),
    ...EXTRAS,
  ];

  it("has 40 distinct exercises", () => {
    expect(goldens).toHaveLength(40);
    expect(new Set(goldens.map((g) => g.id)).size).toBe(40);
  });

  it.each(goldens.map((g) => [g.id, g] as const))("%s", (_id, g) => {
    const c = get(g.id);
    expect(c.modality).toBe(g.modality);
    expect(c.equipment).toBe(g.equipment);
    expect(c.loadType).toBe(g.loadType);
    expect(c.tracking).toBe(g.tracking ?? (g.loadType === "NONE" ? "REPS" : "LOAD_REPS"));
    expect(c.isUnilateral).toBe(g.unilateral ?? false);
    expect(c.bodyweightFactor).toBe(g.bodyweightFactor ?? null);
    expect(c.standardLift).toBe(g.standardLift ?? null);
  });
});

const MACHINE_EQUIPMENT: readonly Equipment[] = ["MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "SMITH_MACHINE", "CABLE"];

describe("machine vs free-weight invariants", () => {
  it("never puts a machine, Smith machine or cable in FREE_WEIGHT, and never the reverse", () => {
    for (const c of all) {
      if (c.modality === "FREE_WEIGHT") expect(MACHINE_EQUIPMENT, c.sourceId).not.toContain(c.equipment);
      if (c.modality === "MACHINE") expect(["MACHINE_SELECTORIZED", "MACHINE_PLATE_LOADED", "SMITH_MACHINE", "OTHER"], c.sourceId).toContain(c.equipment);
      if (c.modality === "CABLE") expect(c.equipment, c.sourceId).toBe("CABLE");
      if (c.equipment === "CABLE") expect(c.modality, c.sourceId).toBe("CABLE");
      if (c.equipment === "SMITH_MACHINE" || c.equipment === "MACHINE_SELECTORIZED" || c.equipment === "MACHINE_PLATE_LOADED") {
        expect(c.modality, c.sourceId).toBe("MACHINE");
      }
    }
  });

  it("follows the dataset: machine rows are MACHINE, cable rows CABLE, unless hand-overridden", () => {
    for (const row of rows) {
      if (row.id in overrides) continue;
      const c = classify(row);
      if (row.equipment === "machine") expect(c.modality, row.id).toBe("MACHINE");
      if (row.equipment === "cable") expect(c.modality, row.id).toBe("CABLE");
      if (row.equipment === "barbell" && /\bsmith\b/i.test(row.name)) expect(c.equipment, row.id).toBe("SMITH_MACHINE");
      if (/\b(smith|leverage|machine)\b/i.test(row.name)) expect(c.modality, row.id).not.toBe("FREE_WEIGHT");
    }
  });

  it("uses load types that match the equipment", () => {
    for (const c of all) {
      if (c.loadType === "STACK") expect(["MACHINE", "CABLE"], c.sourceId).toContain(c.modality);
      if (c.loadType === "PLATES_PER_SIDE") expect(c.equipment, c.sourceId).toBe("MACHINE_PLATE_LOADED");
      if (c.equipment === "MACHINE_SELECTORIZED") expect(c.loadType, c.sourceId).toBe("STACK");
      if (c.equipment === "MACHINE_PLATE_LOADED") expect(c.loadType, c.sourceId).toBe("PLATES_PER_SIDE");
      if (c.equipment === "BARBELL" || c.equipment === "EZ_BAR" || c.equipment === "TRAP_BAR" || c.equipment === "SMITH_MACHINE") {
        expect(c.loadType, c.sourceId).toBe("TOTAL");
      }
      if (c.loadType === "PER_IMPLEMENT") expect(["DUMBBELL", "KETTLEBELL"], c.sourceId).toContain(c.equipment);
    }
  });

  it("gives every BODYWEIGHT_PLUS row a factor in (0, 1], and no other row one", () => {
    for (const c of all) {
      if (c.loadType === "BODYWEIGHT_PLUS") {
        expect(c.modality, c.sourceId).toBe("BODYWEIGHT");
        expect(c.bodyweightFactor, c.sourceId).toBeGreaterThan(0);
        expect(c.bodyweightFactor, c.sourceId).toBeLessThanOrEqual(1);
      } else {
        expect(c.bodyweightFactor, c.sourceId).toBeNull();
      }
    }
  });

  it("matches tracking and load: unloaded rows log reps/time/distance, loaded rows log load and reps", () => {
    for (const c of all) {
      if (c.tracking === "LOAD_REPS") expect(c.loadType, c.sourceId).not.toBe("NONE");
      if (c.tracking === "REPS") expect(c.loadType, c.sourceId).toBe("NONE");
      if (c.tracking === "DURATION" || c.tracking === "DISTANCE_DURATION") expect(c.loadType === "NONE" || c.loadType === "BODYWEIGHT_PLUS", c.sourceId).toBe(true);
      if (c.category === "STRETCHING") expect(c.tracking, c.sourceId).toBe("DURATION");
      if (c.category === "CARDIO") expect(c.tracking, c.sourceId).toBe("DISTANCE_DURATION");
    }
  });

  it("marks each standard lift on exactly one barbell or bodyweight exercise, never a machine", () => {
    const lifts = all.filter((c) => c.standardLift);
    expect(lifts.map((c) => c.standardLift).sort()).toEqual(["BARBELL_ROW", "BENCH_PRESS", "DEADLIFT", "DIP", "OVERHEAD_PRESS", "PULL_UP", "SQUAT"]);
    for (const c of lifts) {
      expect(["BARBELL", "BODYWEIGHT"], c.sourceId).toContain(c.equipment);
      expect(c.modality, c.sourceId).not.toBe("MACHINE");
    }
  });
});

describe("dumbbell and kettlebell load semantics", () => {
  it("a pair is per implement, one held in both hands is the total, one in a single hand is unilateral", () => {
    expect(get("Dumbbell_Bicep_Curl")).toMatchObject({ loadType: "PER_IMPLEMENT", isUnilateral: false });
    expect(get("Goblet_Squat")).toMatchObject({ loadType: "TOTAL", isUnilateral: false });
    expect(get("One-Arm_Dumbbell_Row")).toMatchObject({ loadType: "PER_IMPLEMENT", isUnilateral: true });
    expect(get("Double_Kettlebell_Snatch")).toMatchObject({ loadType: "PER_IMPLEMENT", isUnilateral: false });
    expect(get("Straight-Arm_Dumbbell_Pullover")).toMatchObject({ loadType: "TOTAL" });
  });
});

describe("overrides", () => {
  it("only name dataset rows, and each one changes something the rules would have produced", () => {
    for (const id of OVERRIDDEN_IDS) {
      const row = byId.get(id);
      expect(row, id).toBeDefined();
      expect(classify(row!), id).not.toEqual(classifyByRules(row!));
    }
  });
});

describe("catalog ids", () => {
  it("are unique across the dataset", () => {
    expect(new Set(rows.map((r) => catalogExerciseId(r.id))).size).toBe(rows.length);
  });

  it("are stable (UUIDv5 of the source id, namespace frozen)", () => {
    expect(catalogExerciseId("Barbell_Squat")).toBe("83a024cb-efa6-5b1b-8cef-e115a267bd5b");
    expect(catalogExerciseId("Pullups")).toBe("114afba6-f433-5272-9bd5-56b7face272f");
    expect(catalogExerciseId("Leg_Press")).toBe("cda4642e-23e8-5f6f-82b7-63f85195c232");
    expect(catalogExerciseId("Smith_Machine_Squat")).toBe("4227c415-0a82-59da-b00b-7c94b16a542f");
    expect(catalogExerciseId("Wide-Grip_Lat_Pulldown")).toBe("fd656719-88de-5537-9eb1-0ba43ba7570f");
  });
});
