import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { TemplateEditor } from "@/components/templates/TemplateEditor";
import type { ExerciseRow, MachineProfileCreate, WorkoutSetRow } from "@/contracts/entities";
import { exampleCatalogExerciseRow, exampleWorkoutSetRow } from "@/contracts/fixtures";
import { catalogExerciseId } from "@/lib/ids";
import { ActiveSetPanel } from "./ActiveSetPanel";
import { MachineChooser } from "./MachineChooser";
import { MachineProfileForm } from "./MachineProfileForm";
import { MachinesView } from "./MachinesView";
import { DEFAULT_PREFS } from "./prefs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined, refresh: () => undefined }), usePathname: () => "/" }));

const noop = () => undefined;

const gearInput = (over: Partial<MachineProfileCreate>): MachineProfileCreate => ({ name: "Gear", gymName: null, brand: null, exerciseId: null, labelUnit: null, pinStepKg: null, baseLoadKg: null, platesKg: null, equipment: null, notes: null, ...over });

const exerciseRow = (sourceId: string, over: Partial<ExerciseRow> = {}): ExerciseRow => ({
  ...exampleCatalogExerciseRow,
  id: catalogExerciseId(sourceId),
  sourceId,
  slug: sourceId.toLowerCase(),
  name: sourceId.replaceAll("_", " "),
  ...over,
});
const PRESS = exerciseRow("Leg_Press", { modality: "MACHINE", equipment: "MACHINE_PLATE_LOADED", loadType: "PLATES_PER_SIDE" });

const original = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close };
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});
beforeEach(async () => {
  activateUserDb("user-1");
  await repo.catalog.replace({ version: 1, generatedAt: "2026-10-14T00:00:00.000Z", exercises: [PRESS] });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetAllDbs();
});

describe("MachineProfileForm kind=dumbbells", () => {
  it("asks for the step, with a hint, and saves a gear profile with equipment set and no gym or exercise", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="dumbbells" unit="KG" onSave={onSave} />);
    expect(screen.getByRole("button", { name: "What is Dumbbells and kettlebells?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dumbbell step (kg)")).toHaveValue("2");
    await userEvent.clear(screen.getByLabelText("Dumbbell step (kg)"));
    await userEvent.type(screen.getByLabelText("Dumbbell step (kg)"), "2.5");
    await userEvent.click(screen.getByRole("button", { name: "Save dumbbells" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ equipment: "DUMBBELL", gymName: null, exerciseId: null, pinStepKg: 2.5, platesKg: null, baseLoadKg: null }));
  });

  it("converts pounds to kg and rejects an empty step", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="dumbbells" unit="LB" onSave={onSave} />);
    await userEvent.clear(screen.getByLabelText("Dumbbell step (lb)"));
    await userEvent.click(screen.getByRole("button", { name: "Save dumbbells" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a step above 0");
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Dumbbell step (lb)"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Save dumbbells" }));
    expect(onSave.mock.calls[0]?.[0].pinStepKg).toBeCloseTo(2.268, 2);
  });
});

describe("MachineProfileForm kind=kettlebells", () => {
  it("lists the standard sizes ticked, saves the standard set as null and a custom set sorted in kg", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="kettlebells" unit="KG" onSave={onSave} />);
    expect(screen.getByRole("checkbox", { name: "16 kg kettlebell" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Save kettlebells" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ equipment: "KETTLEBELL", platesKg: null, pinStepKg: null }));
    // Keep only 8, 16 and a custom 18.
    for (const w of [4, 6, 10, 12, 14, 20, 24, 28, 32, 36, 40, 44, 48]) await userEvent.click(screen.getByRole("checkbox", { name: `${w} kg kettlebell` }));
    await userEvent.type(screen.getByLabelText("Add a weight (kg)"), "18");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("checkbox", { name: "18 kg kettlebell" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Save kettlebells" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ platesKg: [8, 16, 18] }));
  });

  it("removes a custom bell, and needs at least one bell", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="kettlebells" unit="KG" initial={gearRow({ equipment: "KETTLEBELL", platesKg: [18] })} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove 18 kg kettlebell" }));
    expect(screen.queryByRole("checkbox", { name: "18 kg kettlebell" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save kettlebells" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tick at least one kettlebell");
    expect(onSave).not.toHaveBeenCalled();
  });
});

function gearRow(over: Partial<MachineProfileCreate>) {
  return { ...gearInput({}), id: "00000000-0000-4000-8000-000000000001", hlc: "", fieldHlc: {}, version: 0, deletedAt: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over } as import("@/contracts/entities").MachineProfileRow;
}

function Panel({ equipment, gear, unit = "KG" }: { equipment: "DUMBBELL" | "KETTLEBELL"; gear: { pinStepKg: number | null; platesKg?: number[] | null } | null; unit?: "KG" | "LB" }) {
  const [set, setSet] = useState<WorkoutSetRow>({ ...exampleWorkoutSetRow, id: "s1", weightKg: null, inputUnit: unit, reps: 5, rir: null, completedAt: null, setType: "WORKING" });
  return (
    <ul>
      <ActiveSetPanel
        label="1"
        ordinal={1}
        set={set}
        exercise={{ equipment, loadType: "PER_IMPLEMENT", tracking: "LOAD_REPS", isUnilateral: false }}
        exerciseName="Curl"
        setCount={3}
        unit={unit}
        step={unit === "KG" ? 2 : 5}
        effortScale="RIR"
        machine={null}
        gear={gear}
        onEditGear={noop}
        onChange={(p) => setSet((s) => ({ ...s, ...p }) as WorkoutSetRow)}
        onToggleComplete={noop}
      />
    </ul>
  );
}

describe("ActiveSetPanel gear", () => {
  it("dumbbells follow the user's step and the link says so", () => {
    render(<Panel equipment="DUMBBELL" gear={{ pinStepKg: 2.5 }} />);
    expect(screen.getByRole("button", { name: "Dumbbells · 2.5 kg steps · Edit" })).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Set 1 weight" }) as HTMLInputElement;
    expect(slider.max).toBeDefined();
  });

  it("dumbbell link is unit-aware", () => {
    render(<Panel equipment="DUMBBELL" gear={null} unit="LB" />);
    expect(screen.getByRole("button", { name: "Dumbbells · 5 lb steps · Edit" })).toBeInTheDocument();
  });

  it("kettlebells use the bells the user owns", () => {
    render(<Panel equipment="KETTLEBELL" gear={{ pinStepKg: null, platesKg: [8, 12, 18] }} />);
    expect(screen.getByRole("button", { name: "Kettlebells · your 3 bells · Edit" })).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "Set 1 weight" }) as HTMLInputElement;
    expect(Number(slider.max)).toBe(2);
  });

  it("kettlebells with no profile use the standard sizes", () => {
    render(<Panel equipment="KETTLEBELL" gear={null} />);
    expect(screen.getByRole("button", { name: "Kettlebells · standard sizes · Edit" })).toBeInTheDocument();
  });
});

describe("gear profiles stay out of machine flows", () => {
  beforeEach(async () => {
    await repo.machineProfiles.create(gearInput({ name: "Dumbbells", equipment: "DUMBBELL", pinStepKg: 2.5 }));
    await repo.machineProfiles.create(gearInput({ name: "Kettlebells", equipment: "KETTLEBELL", platesKg: [8, 12] }));
    await repo.machineProfiles.create(gearInput({ name: "Hammer press", gymName: "Downtown", exerciseId: PRESS.id }));
  });

  it("the machine chooser lists machines, not gear", async () => {
    render(<MachineChooser exercise={PRESS} unit="KG" onChoose={noop} />);
    expect(await screen.findByText(/Hammer press/)).toBeInTheDocument();
    expect(screen.queryByText(/^Dumbbells/)).toBeNull();
    expect(screen.queryByText(/^Kettlebells/)).toBeNull();
  });

  it("the template editor's machine picker excludes gear", async () => {
    const tpl = await repo.templates.create({ name: "Legs", notes: null, folder: null, position: "a0" });
    await repo.templateExercises.create({ templateId: tpl.id, exerciseId: PRESS.id, position: "a0" });
    render(<TemplateEditor id={tpl.id} />);
    const select = (await screen.findByLabelText("Machine")) as HTMLSelectElement;
    const options = [...select.options].map((o) => o.textContent);
    expect(options.some((t) => t?.includes("Hammer press"))).toBe(true);
    expect(options.some((t) => t?.startsWith("Dumbbells") || t?.startsWith("Kettlebells"))).toBe(false);
  });
});

describe("Settings gear section", () => {
  it("shows the defaults, then the saved step and bells, and lists no gear as a machine", async () => {
    render(<MachinesView />);
    const gear = await screen.findByRole("region", { name: /Gear/ });
    expect(within(gear).getByText("2 kg steps (default)")).toBeInTheDocument();
    expect(within(gear).getByText("Standard sizes")).toBeInTheDocument();
    expect(DEFAULT_PREFS.unit).toBe("KG");
    await repo.machineProfiles.create(gearInput({ name: "Dumbbells", equipment: "DUMBBELL", pinStepKg: 2.5 }));
    await repo.machineProfiles.create(gearInput({ name: "Kettlebells", equipment: "KETTLEBELL", platesKg: [18, 8, 12] }));
    await waitFor(() => expect(within(gear).getByText("2.5 kg steps")).toBeInTheDocument());
    expect(within(gear).getByText("Your 3 bells: 8, 12, 18 kg")).toBeInTheDocument();
    expect(screen.getByText("No machines yet")).toBeInTheDocument();
  });

  it("Edit opens the sheet and the first save creates the user-wide gear profile", async () => {
    render(<MachinesView />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit dumbbells" }));
    const step = await screen.findByLabelText("Dumbbell step (kg)");
    await userEvent.clear(step);
    await userEvent.type(step, "2.5");
    await userEvent.click(screen.getByRole("button", { name: "Save dumbbells" }));
    await waitFor(async () => expect((await repo.machineProfiles.gear("DUMBBELL"))?.pinStepKg).toBe(2.5));
    const row = await repo.machineProfiles.gear("DUMBBELL");
    expect(row).toMatchObject({ equipment: "DUMBBELL", gymName: null, exerciseId: null });
  });
});
