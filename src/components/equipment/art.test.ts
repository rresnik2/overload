import { describe, expect, it } from "vitest";
import { EQUIPMENT_VALUES, type Equipment, type LoadType } from "@/contracts/enums";
import { artFor, barShapeFor, resolveBelt } from "./art";

const ex = (name: string, equipment: Equipment, loadType: LoadType = "NONE") => ({ name, equipment, loadType });
const kind = (name: string, equipment: Equipment, loadType: LoadType = "NONE") => artFor(ex(name, equipment, loadType)).kind;

describe("artFor", () => {
  it("gives every equipment value a drawing", () => {
    for (const equipment of EQUIPMENT_VALUES) expect(artFor(ex("Anything", equipment, "TOTAL")).kind).toBeTruthy();
  });

  it("draws each bar in its own shape", () => {
    expect(artFor(ex("Barbell Squat", "BARBELL", "TOTAL"))).toEqual({ kind: "bar", shape: "straight" });
    expect(artFor(ex("EZ-Bar Curl", "EZ_BAR", "TOTAL"))).toEqual({ kind: "bar", shape: "ez" });
    expect(artFor(ex("Trap Bar Deadlift", "TRAP_BAR", "TOTAL"))).toEqual({ kind: "bar", shape: "trap" });
    expect(artFor(ex("Smith Machine Squat", "SMITH_MACHINE", "TOTAL"))).toEqual({ kind: "bar", shape: "smith" });
    expect(artFor(ex("Axle Deadlift", "OTHER", "TOTAL"))).toEqual({ kind: "bar", shape: "axle" });
    expect(artFor(ex("Log Lift", "OTHER", "TOTAL"))).toEqual({ kind: "bar", shape: "log" });
  });

  it("puts the attachment the exercise uses on a cable", () => {
    const att = (name: string) => {
      const spec = artFor(ex(name, "CABLE", "STACK"));
      return spec.kind === "cable" ? spec.attachment : null;
    };
    expect(att("Triceps Pushdown - Rope Attachment")).toBe("rope");
    expect(att("Face Pull")).toBe("rope");
    expect(att("Cable Crunch")).toBe("rope");
    expect(att("Triceps Pushdown - V-Bar Attachment")).toBe("v-bar");
    expect(att("Seated Cable Rows")).toBe("v-bar");
    expect(att("Close-Grip Front Lat Pulldown")).toBe("v-bar");
    expect(att("Wide-Grip Lat Pulldown")).toBe("lat-bar");
    expect(att("One Arm Lat Pulldown")).toBe("d-handle");
    expect(att("Straight-Arm Pulldown")).toBe("straight-bar");
    expect(att("Triceps Pushdown")).toBe("straight-bar");
    expect(att("Standing Biceps Cable Curl")).toBe("straight-bar");
    expect(att("Standing One-Arm Cable Curl")).toBe("d-handle");
    expect(att("One-Legged Cable Kickback")).toBe("ankle-strap");
    expect(att("Cable Hip Adduction")).toBe("ankle-strap");
    expect(att("Cable Crossover")).toBe("d-handle");
    expect(att("Pallof Press")).toBe("d-handle");
  });

  it("finds the apparatus a bodyweight exercise is done on, defaulting to the mat", () => {
    expect(kind("Pullups", "BODYWEIGHT")).toBe("pullup-bar");
    expect(kind("Hanging Leg Raise", "BODYWEIGHT")).toBe("pullup-bar");
    expect(kind("Inverted Row", "BODYWEIGHT")).toBe("pullup-bar");
    expect(kind("Ring Dips", "BODYWEIGHT")).toBe("rings");
    expect(kind("Suspended Push-Up", "BODYWEIGHT")).toBe("straps");
    expect(kind("Bench Dips", "BODYWEIGHT")).toBe("bench");
    expect(kind("Dips - Triceps Version", "BODYWEIGHT")).toBe("dip-bars");
    expect(kind("Box Jump (Multiple Response)", "BODYWEIGHT")).toBe("box");
    expect(kind("Hyperextensions (Back Extensions)", "BODYWEIGHT")).toBe("bench");
    expect(kind("Pushups", "BODYWEIGHT")).toBe("mat");
    expect(kind("90/90 Hamstring", "BODYWEIGHT")).toBe("mat");
    expect(kind("Chin To Chest Stretch", "BODYWEIGHT")).toBe("mat");
    expect(kind("Floor Glute-Ham Raise", "BODYWEIGHT")).toBe("mat");
  });

  it("draws added bodyweight load as a dip belt", () => {
    expect(kind("Weighted Pull Ups", "BODYWEIGHT", "BODYWEIGHT_PLUS")).toBe("belt");
  });

  it("recognises strongman and conditioning kit filed under OTHER", () => {
    expect(kind("Sled Push", "OTHER", "TOTAL")).toBe("sled");
    expect(kind("Prowler Sprint", "OTHER")).toBe("sled");
    expect(kind("Atlas Stones", "OTHER")).toBe("stone");
    expect(kind("Keg Load", "OTHER")).toBe("keg");
    expect(kind("Sandbag Load", "OTHER")).toBe("sandbag");
    expect(kind("Tire Flip", "OTHER")).toBe("tire");
    expect(kind("Sledgehammer Swings", "OTHER")).toBe("sledgehammer");
    expect(kind("Yoke Walk", "OTHER")).toBe("yoke");
    expect(kind("Farmer's Walk", "OTHER")).toBe("farmer");
    expect(kind("Rickshaw Carry", "OTHER")).toBe("farmer");
    expect(kind("Battling Ropes", "OTHER")).toBe("battle-rope");
    expect(kind("Rope Jumping", "OTHER")).toBe("jump-rope");
    expect(kind("Walking, Treadmill", "OTHER")).toBe("treadmill");
    expect(kind("Recumbent Bike", "OTHER")).toBe("bike");
    expect(kind("Elliptical Trainer", "OTHER")).toBe("bike");
    expect(kind("Rowing, Stationary", "OTHER")).toBe("rower");
    expect(kind("Step Mill", "OTHER")).toBe("stairs");
    expect(kind("Heavy Bag Thrust", "OTHER")).toBe("heavy-bag");
    expect(kind("Conan's Wheel", "OTHER")).toBe("generic");
  });

  it("maps the remaining equipment one to one", () => {
    expect(kind("Leg Press", "MACHINE_PLATE_LOADED", "PLATES_PER_SIDE")).toBe("horn");
    expect(kind("Lying Leg Curls", "MACHINE_SELECTORIZED", "STACK")).toBe("stack");
    expect(kind("Incline Dumbbell Press", "DUMBBELL", "PER_IMPLEMENT")).toBe("dumbbell");
    expect(kind("Kettlebell Swing", "KETTLEBELL", "TOTAL")).toBe("kettlebell");
    expect(kind("Front Plate Raise", "PLATE", "TOTAL")).toBe("plate");
    expect(kind("Medicine Ball Chest Pass", "MEDICINE_BALL", "TOTAL")).toBe("medicine-ball");
    expect(kind("Exercise Ball Crunch", "EXERCISE_BALL")).toBe("exercise-ball");
    expect(kind("IT Band SMR", "FOAM_ROLL")).toBe("foam-roller");
    expect(kind("Band Pull Apart", "BAND")).toBe("band");
  });
});

describe("resolveBelt", () => {
  const pullups = ex("Weighted Pull Ups", "BODYWEIGHT", "BODYWEIGHT_PLUS");
  const dips = ex("Parallel Bar Dip", "BODYWEIGHT", "BODYWEIGHT_PLUS");

  it("keeps the belt when weight was added", () => {
    expect(resolveBelt(artFor(pullups), pullups, 20).kind).toBe("belt");
  });

  it("draws the apparatus when nothing was added", () => {
    expect(resolveBelt(artFor(pullups), pullups, null).kind).toBe("pullup-bar");
    expect(resolveBelt(artFor(dips), dips, 0).kind).toBe("dip-bars");
  });

  it("leaves other kinds alone", () => {
    const squat = ex("Barbell Squat", "BARBELL", "TOTAL");
    expect(resolveBelt(artFor(squat), squat, null)).toEqual(artFor(squat));
  });
});

describe("barShapeFor", () => {
  it("names the bar of each bar equipment", () => {
    expect(barShapeFor("BARBELL")).toBe("straight");
    expect(barShapeFor("EZ_BAR")).toBe("ez");
    expect(barShapeFor("TRAP_BAR")).toBe("trap");
    expect(barShapeFor("SMITH_MACHINE")).toBe("smith");
  });
});
