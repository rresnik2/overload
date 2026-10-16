import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exampleCatalogExerciseRow, exampleMachineProfileRow, exampleWorkoutExerciseRow, exampleWorkoutSetRow } from "@/contracts/fixtures";
import type { WorkoutSetRow } from "@/contracts/entities";
import type { Equipment, LoadType, WeightUnit } from "@/contracts/enums";
import { ActiveSetPanel, LOGGED_FLASH_MS, type ActiveSetPanelProps } from "./ActiveSetPanel";
import { dialSetup } from "./dial-setup";
import { EquipmentPicture } from "./EquipmentPicture";
import { ExerciseBlock } from "./ExerciseBlock";
import { MachineProfileForm } from "./MachineProfileForm";
import { SetRow } from "./SetRow";
import type { ExerciseView } from "./view";
import { DEFAULT_PREFS } from "./prefs";

const noop = () => undefined;

const setRow = (over: Partial<WorkoutSetRow> = {}): WorkoutSetRow => ({ ...exampleWorkoutSetRow, id: "s1", weightKg: 100, inputUnit: "KG", reps: 5, rir: null, completedAt: null, setType: "WORKING", ...over });

const ex = (equipment: Equipment, loadType: LoadType, isUnilateral = false) => ({ equipment, loadType, tracking: "LOAD_REPS" as const, isUnilateral });

function Harness({ initial, exercise = ex("BARBELL", "TOTAL"), unit = "KG", machine = null, onChange, onToggleComplete, ...rest }: { initial?: Partial<WorkoutSetRow>; exercise?: ReturnType<typeof ex>; unit?: WeightUnit; machine?: ActiveSetPanelProps["machine"] } & Partial<ActiveSetPanelProps>) {
  const [set, setSet] = useState(setRow(initial));
  return (
    <ul>
      <ActiveSetPanel
        label="1"
        ordinal={1}
        set={set}
        exercise={exercise}
        exerciseName="Bench press"
        setCount={4}
        unit={unit}
        step={unit === "KG" ? 2.5 : 5}
        effortScale="RIR"
        machine={machine}
        onChange={(p) => {
          setSet((s) => ({ ...s, ...p }) as WorkoutSetRow);
          onChange?.(p);
        }}
        onToggleComplete={() => onToggleComplete?.()}
        {...rest}
      />
    </ul>
  );
}

const slider = (name = "Set 1 weight") => screen.getByRole("slider", { name }) as HTMLInputElement;

describe("ActiveSetPanel", () => {
  it("keeps the wk-set class and data-set-id, and shows name, meta, picture, readout, dial, reps, effort and Log set", () => {
    render(<Harness />);
    const li = document.querySelector("li.wk-set") as HTMLElement;
    expect(li).toHaveAttribute("data-set-id", "s1");
    expect(li).toHaveAttribute("data-state", "active");
    expect(screen.getByText(/Barbell · 20 kg bar · set 1 of 4/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Bar loaded with/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Set 1 weight 100, tap to type/ })).toHaveTextContent("100");
    expect(slider()).toHaveAttribute("aria-valuetext", "100 kilograms total");
    expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Set 1 RIR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log set · 100 kg × 5" })).toBeEnabled();
  });

  it("writes dial turns through weightPatch in kg", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    slider().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 102.5, inputUnit: "KG" });
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 97.5, inputUnit: "KG" });
  });

  it("writes dial turns in pounds, stored as kg with the unit it was entered in", async () => {
    const onChange = vi.fn();
    render(<Harness unit="LB" initial={{ weightKg: 61.235, inputUnit: "LB" }} onChange={onChange} />);
    expect(slider()).toHaveAttribute("aria-valuetext", "135 pounds total");
    slider().focus();
    await userEvent.keyboard("{ArrowRight}");
    // 135 lb -> 140 lb (a 45 lb bar and 2.5 lb plates step by 5 lb)
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 63.503, inputUnit: "LB" });
  });

  it("taps the number to type: the value is saved as typed and the dial lands on it", async () => {
    const onChange = vi.fn();
    render(<Harness exercise={ex("DUMBBELL", "PER_IMPLEMENT")} initial={{ weightKg: 32 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 32, tap to type/ }));
    const input = screen.getByRole("textbox", { name: "Type set 1 weight in kilograms" });
    expect(input).toHaveFocus();
    await userEvent.keyboard("31{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 31, inputUnit: "KG" });
    // off-step 31 was inserted into the dial values, so the dial shows it
    expect(slider()).toHaveAttribute("aria-valuetext", "31 kilograms per hand");
    // Enter returns focus to the readout
    expect(screen.getByRole("button", { name: /^Set 1 weight 31/ })).toHaveFocus();
  });

  it("Esc cancels typing and an empty or non-numeric entry reverts", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 100/ }));
    await userEvent.keyboard("{Control>}a{/Control}999{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 100/ }));
    await userEvent.keyboard("{Control>}a{/Control}abc{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Set 1 weight 100/ })).toBeInTheDocument();
  });

  it("an off-step barbell weight shows the inexact-loading note", () => {
    render(<Harness initial={{ weightKg: 101 }} />);
    expect(screen.getByText(/101 kg can’t be loaded exactly · nearest 100 kg/)).toBeInTheDocument();
  });

  it("writes reps and effort, and clears an effort that is tapped again", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} initial={{ rir: 2 }} />);
    await userEvent.click(screen.getByRole("button", { name: "Set 1 RIR 3" }));
    expect(onChange).toHaveBeenLastCalledWith({ rir: 3 });
    await userEvent.click(screen.getByRole("button", { name: "Set 1 RIR 3" }));
    expect(onChange).toHaveBeenLastCalledWith({ rir: null });
    screen.getByRole("spinbutton", { name: "Set 1 reps" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith({ reps: 6 });
  });

  it("hides the effort row on a warm-up", () => {
    render(<Harness initial={{ setType: "WARMUP" }} />);
    expect(screen.queryByRole("group", { name: /RIR/ })).toBeNull();
  });

  it("has no weight, picture or dial for a reps-only exercise", () => {
    render(<Harness exercise={{ equipment: "BODYWEIGHT", loadType: "NONE", tracking: "REPS", isUnilateral: false } as never} initial={{ weightKg: null }} />);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("spinbutton", { name: "Set 1 reps" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Set 1 RIR" })).toBeInTheDocument();
  });

  it("disables Log set with a hint when there is neither weight nor reps", () => {
    render(<Harness initial={{ weightKg: null, reps: null }} />);
    expect(screen.getByRole("button", { name: "Log set" })).toBeDisabled();
    expect(screen.getByText("Set a weight or reps first")).toBeInTheDocument();
    expect(screen.getByText("—", { selector: "button" })).toBeInTheDocument();
  });

  it("shows last time's values until they are entered, and Log set uses them", () => {
    render(<Harness initial={{ weightKg: null, reps: null }} ghost={{ weightKg: 95, reps: 6, inputUnit: "KG", durationSec: null, distanceM: null, rir: 2 }} />);
    expect(screen.getByText(/last 95 × 6 @ RIR 2/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log set · 95 kg × 6" })).toBeEnabled();
  });

  describe("Log set", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("calls back, flashes Logged for 1300 ms once the set completes, then advances", () => {
      const onToggleComplete = vi.fn();
      const onAdvance = vi.fn();
      const props = { label: "1", ordinal: 1, exercise: ex("BARBELL", "TOTAL"), exerciseName: "Bench press", setCount: 4, unit: "KG" as const, step: 2.5, effortScale: "RIR" as const, machine: null, onChange: noop, onToggleComplete, onAdvance };
      const { rerender } = render(
        <ul>
          <ActiveSetPanel {...props} set={setRow()} />
        </ul>,
      );
      fireEvent.click(screen.getByRole("button", { name: "Log set · 100 kg × 5" }));
      expect(onToggleComplete).toHaveBeenCalledTimes(1);
      // nothing flashes until the write lands
      expect(screen.queryByText("Logged ✓")).toBeNull();
      rerender(
        <ul>
          <ActiveSetPanel {...props} set={setRow({ completedAt: "2026-10-15T10:00:00.000Z" })} />
        </ul>,
      );
      expect(screen.getByRole("button", { name: "Logged ✓" })).toBeInTheDocument();
      expect(slider()).toBeDisabled();
      act(() => void vi.advanceTimersByTime(LOGGED_FLASH_MS - 50));
      expect(onAdvance).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(60));
      expect(onAdvance).toHaveBeenCalledTimes(1);
    });

    it("a completed set opened from its compact row offers Edit set instead", () => {
      const onToggleComplete = vi.fn();
      render(<Harness initial={{ completedAt: "2026-10-15T10:00:00.000Z" }} onToggleComplete={onToggleComplete} />);
      expect(slider()).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Edit set" }));
      expect(onToggleComplete).toHaveBeenCalledTimes(1);
    });
  });
});

describe("SetRow compact", () => {
  const base = { label: "2", ordinal: 2, exercise: ex("BARBELL", "TOTAL"), unit: "KG" as const, step: 2.5, effortScale: "RIR" as const, onChange: noop, onToggleComplete: noop, onDelete: noop };

  it("is a read-only summary button that keeps wk-set and data-set-id", async () => {
    const onActivate = vi.fn();
    render(
      <ul>
        <SetRow {...base} variant="compact" set={setRow({ id: "s2", rir: 2, completedAt: "2026-10-15T10:00:00.000Z" })} onActivate={onActivate} />
      </ul>,
    );
    const li = document.querySelector("li.wk-set") as HTMLElement;
    expect(li).toHaveAttribute("data-set-id", "s2");
    expect(li).toHaveAttribute("data-state", "completed");
    expect(li).toHaveClass("wk-set--compact");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(li).toHaveTextContent("100 kg × 5");
    expect(li).toHaveTextContent("RIR 2");
    await userEvent.click(screen.getByRole("button", { name: /^Set 2: 100 kg × 5, RIR 2, done/ }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("shows last time for a planned set with nothing entered", () => {
    render(
      <ul>
        <SetRow {...base} variant="compact" set={setRow({ weightKg: null, reps: null })} ghost={{ weightKg: 95, reps: 6, inputUnit: "KG", durationSec: null, distanceM: null }} />
      </ul>,
    );
    expect(document.querySelector("li.wk-set")).toHaveAttribute("data-state", "planned");
    expect(screen.getByText("last 95 × 6")).toBeInTheDocument();
  });
});

describe("EquipmentPicture", () => {
  const draw = (equipment: Equipment, loadType: LoadType, value: number | null, opts: { unit?: WeightUnit; step?: number; machine?: Parameters<typeof dialSetup>[0]["machine"]; isUnilateral?: boolean } = {}) => {
    const unit = opts.unit ?? "KG";
    const exercise = ex(equipment, loadType, opts.isUnilateral);
    const setup = dialSetup({ exercise, unit, step: opts.step ?? (unit === "KG" ? 2.5 : 5), current: value, machine: opts.machine ?? null });
    if (!setup.kind) throw new Error("no picture");
    return render(<EquipmentPicture kind={setup.kind} loadType={loadType} isUnilateral={exercise.isUnilateral} setup={setup} value={value} hasProfile={opts.machine != null} />);
  };

  it("barbell: 102.5 kg is 25 + 15 + 1.25 per side", () => {
    const { container } = draw("BARBELL", "TOTAL", 102.5);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Bar loaded with 25, 15, 1.25 kilograms per side");
    expect(container.querySelectorAll('.eq-plate[data-tone="red"]')).toHaveLength(2);
    expect(container.querySelectorAll(".eq-plate")).toHaveLength(6);
    expect(container.querySelector(".eq__caption")).toHaveTextContent(/Per side\s*25\s*\+\s*15\s*\+\s*1\.25/);
  });

  it("barbell: the empty bar, a weight below the bar, and one that cannot be loaded exactly", () => {
    const empty = draw("BARBELL", "TOTAL", 20);
    expect(empty.container.querySelectorAll(".eq-plate")).toHaveLength(0);
    expect(empty.container.querySelector(".eq__caption")).toHaveTextContent("Empty bar · 20 kg");
    empty.unmount();
    const light = draw("BARBELL", "TOTAL", 15);
    expect(light.container.querySelector(".eq__caption")).toHaveTextContent("Lighter than the 20 kg bar");
    light.unmount();
    const off = draw("BARBELL", "TOTAL", 101);
    expect(off.container.querySelector(".eq__caption")).toHaveTextContent("101 kg can’t be loaded exactly · nearest 100 kg");
  });

  it("barbell: uses the bar profile's weight and plates", () => {
    const { container } = draw("BARBELL", "TOTAL", 70, { machine: { pinStepKg: null, baseLoadKg: 15, platesKg: [20, 10, 5] } });
    // (70 - 15) / 2 = 27.5 is not makeable with 20/10/5: nearest below is 25 per side -> 65 kg
    expect(container.querySelector(".eq__caption")).toHaveTextContent("70 kg can’t be loaded exactly · nearest 65 kg");
    expect(container.querySelectorAll(".eq-plate").length).toBe(4);
  });

  it("barbell with no value rests on the empty bar at half strength", () => {
    const { container } = draw("BARBELL", "TOTAL", null);
    expect(container.querySelector(".eq")).toHaveClass("eq--ghost");
    expect(container.querySelector(".eq__caption")).toHaveTextContent("Empty bar · 20 kg");
  });

  it("plate-loaded machine: one horn, per-side plates and the base load", () => {
    const { container } = draw("MACHINE_PLATE_LOADED", "PLATES_PER_SIDE", 30, { machine: { pinStepKg: null, baseLoadKg: 30 } });
    expect(container.querySelectorAll(".eq-plate").length).toBeGreaterThan(0);
    expect(container.querySelector(".eq__caption")).toHaveTextContent("+ 30 kg base = 90 kg total");
  });

  it("dumbbell: a pair per hand, one when unilateral or total", () => {
    const pair = draw("DUMBBELL", "PER_IMPLEMENT", 32);
    expect(pair.container.querySelector(".eq__caption")).toHaveTextContent("Pair of 32 kg · 64 kg total");
    expect(pair.container.querySelectorAll(".eq-db--l")).toHaveLength(2);
    pair.unmount();
    const one = draw("DUMBBELL", "PER_IMPLEMENT", 32, { isUnilateral: true });
    expect(one.container.querySelector(".eq__caption")).toHaveTextContent("One 32 kg dumbbell");
    expect(one.container.querySelectorAll(".eq-db--l")).toHaveLength(1);
    one.unmount();
    const goblet = draw("DUMBBELL", "TOTAL", 32);
    expect(goblet.container.querySelector(".eq__caption")).toHaveTextContent("One 32 kg dumbbell");
  });

  it("kettlebell: the bell takes the colour and stamped number of its size, in kg and lb", () => {
    const kg = draw("KETTLEBELL", "TOTAL", 24);
    expect(kg.container.querySelector<SVGPathElement>(".eq-kb__body")!.style.fill).toBe("rgb(47, 154, 79)");
    expect(kg.container.querySelector(".eq-kb__num")).toHaveTextContent("24");
    expect(kg.container.querySelector(".eq__caption")).toHaveTextContent("24 kg bell");
    kg.unmount();
    const lb = draw("KETTLEBELL", "TOTAL", 53, { unit: "LB" });
    expect(lb.container.querySelector<SVGPathElement>(".eq-kb__body")!.style.fill).toBe("rgb(47, 154, 79)"); // 53 lb is the 24 kg bell
    expect(lb.container.querySelector(".eq__caption")).toHaveTextContent("53 lb bell");
  });

  it("weight stack: the pin and the lifted plates follow the weight", () => {
    const withProfile = draw("MACHINE_SELECTORIZED", "STACK", 45, { step: 5, machine: { pinStepKg: 5, baseLoadKg: null } });
    expect(withProfile.container.querySelectorAll(".eq-sp.is-on")).toHaveLength(9);
    expect(withProfile.container.querySelector(".eq__caption")).toHaveTextContent("Pin 9 of 20 · 45 kg · 5 kg per plate");
    withProfile.unmount();
    const noProfile = draw("MACHINE_SELECTORIZED", "STACK", 45, { step: 5 });
    expect(noProfile.container.querySelector(".eq__caption")).toHaveTextContent("Pin 9 · 45 kg · 5 kg per plate");
  });

  it("has no picture for bodyweight-plus, plates or medicine balls", () => {
    for (const [equipment, loadType] of [["BODYWEIGHT", "BODYWEIGHT_PLUS"], ["PLATE", "TOTAL"], ["MEDICINE_BALL", "TOTAL"]] as const) {
      expect(dialSetup({ exercise: ex(equipment, loadType), unit: "KG", step: 2.5, current: 10, machine: null }).kind).toBeNull();
    }
  });
});

describe("MachineProfileForm kind=bar", () => {
  it("labels the base load Bar weight with a hint and offers a checkbox per plate, all on by default", () => {
    render(<MachineProfileForm kind="bar" unit="KG" exerciseId="e1" defaultName="Back squat bar" onSave={noop} />);
    expect(screen.getByLabelText("Bar weight (kg)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What is Bar weight?" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Base load/)).toBeNull();
    expect(screen.queryByLabelText(/Pin step/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Back squat bar");
    for (const w of [25, 20, 15, 10, 5, 2.5, 1.25]) expect(screen.getByRole("checkbox", { name: `${w} kg plate` })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "0.5 kg plate" })).not.toBeChecked();
  });

  it("saves the standard set as null and a custom set as kg values, with the bar weight and exercise link", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="bar" unit="KG" exerciseId="e1" defaultName="Bar" onSave={onSave} />);
    await userEvent.type(screen.getByLabelText("Bar weight (kg)"), "15");
    await userEvent.click(screen.getByRole("button", { name: "Save bar and plates" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Bar", exerciseId: "e1", baseLoadKg: 15, platesKg: null }));
    await userEvent.click(screen.getByRole("checkbox", { name: "1.25 kg plate" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "0.5 kg plate" }));
    await userEvent.click(screen.getByRole("button", { name: "Save bar and plates" }));
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ platesKg: [25, 20, 15, 10, 5, 2.5, 0.5] }));
  });

  it("asks for at least one plate, and reads an existing inventory and unit", async () => {
    const onSave = vi.fn();
    render(<MachineProfileForm kind="bar" unit="KG" initial={{ ...exampleMachineProfileRow, labelUnit: "LB", baseLoadKg: 20.412, platesKg: [20.412, 11.34] }} onSave={onSave} />);
    expect(screen.getByLabelText("Bar weight (lb)")).toHaveValue("45");
    expect(screen.getByRole("checkbox", { name: "45 lb plate" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "25 lb plate" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "55 lb plate" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "45 lb plate" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "25 lb plate" }));
    await userEvent.click(screen.getByRole("button", { name: "Save bar and plates" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Tick at least one plate size");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("the machine form keeps Base load and shows plates only when asked", () => {
    const { rerender } = render(<MachineProfileForm unit="KG" onSave={noop} />);
    expect(screen.getByLabelText("Base load (kg)")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(<MachineProfileForm unit="KG" plates onSave={noop} />);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(5);
  });
});

describe("ExerciseBlock phone and desktop layouts", () => {
  const view = (): ExerciseView => ({
    we: exampleWorkoutExerciseRow,
    exercise: { ...exampleCatalogExerciseRow, equipment: "BARBELL", loadType: "TOTAL", tracking: "LOAD_REPS", modality: "FREE_WEIGHT" },
    machine: null,
    barProfile: null,
    last: undefined,
    sets: [
      setRow({ id: "a", position: "a0", completedAt: "2026-10-15T10:00:00.000Z" }),
      setRow({ id: "b", position: "a1" }),
      setRow({ id: "c", position: "a2" }),
    ],
  });
  const actions = { onSetChange: noop, onToggleSet: noop, onDeleteSet: noop, onAddSet: noop, onRemove: noop, onMove: noop, onSuperset: noop };
  const mq = (matches: boolean) => {
    window.matchMedia = ((query: string) => ({ matches, media: query, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  };
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  const block = (props: Partial<React.ComponentProps<typeof ExerciseBlock>> = {}) => <ExerciseBlock item={view()} prefs={DEFAULT_PREFS} prs={new Map()} actions={actions} canMoveUp={false} canMoveDown={false} canLinkNext={false} panel {...props} />;

  it("phone: the first incomplete set is the panel, the others are compact rows, and the legend stays visible", async () => {
    mq(true);
    render(block());
    const rows = Array.from(document.querySelectorAll("li.wk-set"));
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.getAttribute("data-set-id"))).toEqual(["a", "b", "c"]);
    expect(document.querySelectorAll("li.wk-panel")).toHaveLength(1);
    expect(document.querySelector("li.wk-panel")).toHaveAttribute("data-set-id", "b");
    expect(document.querySelectorAll("li.wk-set--compact")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "What is Total weight?" })).toBeVisible();
    // tapping a compact row makes it the active set
    await userEvent.click(screen.getByRole("button", { name: /^Set 3:/ }));
    expect(document.querySelector("li.wk-panel")).toHaveAttribute("data-set-id", "c");
  });

  it("phone: an exercise that is not focused shows compact rows only", () => {
    mq(true);
    render(block({ focused: false }));
    expect(document.querySelectorAll("li.wk-panel")).toHaveLength(0);
    expect(document.querySelectorAll("li.wk-set--compact")).toHaveLength(3);
  });

  it("desktop with a fine pointer: inline typing rows, a 96px picture beside the active one, no dial", () => {
    mq(false);
    render(block());
    expect(document.querySelectorAll("li.wk-panel")).toHaveLength(0);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getAllByRole("textbox", { name: /weight/ }).length).toBe(3);
    expect(document.querySelectorAll(".eq--preview")).toHaveLength(1);
    expect(document.querySelector("li.wk-set--active")?.querySelector(".eq--preview")).not.toBeNull();
  });

  it("history edits (no panel flag) keep today's rows on a phone", () => {
    mq(true);
    render(block({ panel: false }));
    expect(document.querySelectorAll("li.wk-panel")).toHaveLength(0);
    expect(document.querySelectorAll("li.wk-set--compact")).toHaveLength(0);
    expect(document.querySelectorAll(".eq--preview")).toHaveLength(0);
  });
});
