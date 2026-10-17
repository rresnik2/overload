// Every equipment drawing (src/components/equipment), loaded and as a ghost, at the hero and thumbnail sizes.
import { EquipmentArt } from "@/components/workout/equipment/EquipmentArt";
import type { Equipment, LoadType } from "@/contracts/enums";

interface Sample {
  name: string;
  equipment: Equipment;
  loadType: LoadType;
  load: number | null;
  isUnilateral?: boolean;
}

const SAMPLES: Sample[] = [
  { name: "Barbell Squat", equipment: "BARBELL", loadType: "TOTAL", load: 110 },
  { name: "EZ-Bar Curl", equipment: "EZ_BAR", loadType: "TOTAL", load: 30 },
  { name: "Trap Bar Deadlift", equipment: "TRAP_BAR", loadType: "TOTAL", load: 140 },
  { name: "Smith Machine Squat", equipment: "SMITH_MACHINE", loadType: "TOTAL", load: 80 },
  { name: "Axle Deadlift", equipment: "OTHER", loadType: "TOTAL", load: 120 },
  { name: "Log Lift", equipment: "OTHER", loadType: "TOTAL", load: 70 },
  { name: "Leg Press", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE", load: 87.5 },
  { name: "Lying Leg Curls", equipment: "MACHINE_SELECTORIZED", loadType: "STACK", load: 45 },
  { name: "Triceps Pushdown - Rope Attachment", equipment: "CABLE", loadType: "STACK", load: 25 },
  { name: "Seated Cable Rows", equipment: "CABLE", loadType: "STACK", load: 50 },
  { name: "Wide-Grip Lat Pulldown", equipment: "CABLE", loadType: "STACK", load: 55 },
  { name: "Standing One-Arm Cable Curl", equipment: "CABLE", loadType: "STACK", load: 10 },
  { name: "Triceps Pushdown", equipment: "CABLE", loadType: "STACK", load: 30 },
  { name: "One-Legged Cable Kickback", equipment: "CABLE", loadType: "STACK", load: 15 },
  { name: "Incline Dumbbell Press", equipment: "DUMBBELL", loadType: "PER_IMPLEMENT", load: 30 },
  { name: "Goblet Squat", equipment: "DUMBBELL", loadType: "TOTAL", load: 24, isUnilateral: true },
  { name: "Kettlebell Swing", equipment: "KETTLEBELL", loadType: "TOTAL", load: 24 },
  { name: "Pullups", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", load: 27.5 },
  { name: "Parallel Bar Dip", equipment: "BODYWEIGHT", loadType: "BODYWEIGHT_PLUS", load: null },
  { name: "Front Plate Raise", equipment: "PLATE", loadType: "TOTAL", load: 20 },
  { name: "Medicine Ball Chest Pass", equipment: "MEDICINE_BALL", loadType: "TOTAL", load: 6 },
  { name: "Sled Push", equipment: "OTHER", loadType: "TOTAL", load: 60 },
  { name: "Farmer's Walk", equipment: "OTHER", loadType: "TOTAL", load: null },
  { name: "Muscle Up", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Ring Dips", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Suspended Row", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Box Jump", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Hyperextensions", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Plank", equipment: "BODYWEIGHT", loadType: "NONE", load: null },
  { name: "Band Pull Apart", equipment: "BAND", loadType: "NONE", load: null },
  { name: "Exercise Ball Crunch", equipment: "EXERCISE_BALL", loadType: "NONE", load: null },
  { name: "IT Band SMR", equipment: "FOAM_ROLL", loadType: "NONE", load: null },
  { name: "Atlas Stones", equipment: "OTHER", loadType: "TOTAL", load: null },
  { name: "Keg Load", equipment: "OTHER", loadType: "TOTAL", load: null },
  { name: "Sandbag Load", equipment: "OTHER", loadType: "TOTAL", load: null },
  { name: "Tire Flip", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Yoke Walk", equipment: "OTHER", loadType: "TOTAL", load: null },
  { name: "Battling Ropes", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Rope Jumping", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Running, Treadmill", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Recumbent Bike", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Rowing, Stationary", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Stairmaster", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Sledgehammer Swings", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Heavy Bag Thrust", equipment: "OTHER", loadType: "NONE", load: null },
  { name: "Conan's Wheel", equipment: "OTHER", loadType: "TOTAL", load: null },
];

export function EquipmentGallery() {
  return (
    <ul className="sg-equipment">
      {SAMPLES.map((s) => (
        <li key={s.name} className="sg-equipment__item">
          <EquipmentArt exercise={s} unit="KG" load={s.load} size="hero" />
          <span className="sg-equipment__row">
            <EquipmentArt exercise={s} unit="KG" load={s.load} />
            <EquipmentArt exercise={s} unit="KG" load={null} />
          </span>
          <span className="sg-equipment__name">{s.name}</span>
          <span className="sg-equipment__load num">{s.load === null ? "nothing logged" : `${s.load} kg`}</span>
        </li>
      ))}
    </ul>
  );
}
