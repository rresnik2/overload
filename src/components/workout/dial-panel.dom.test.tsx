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

  it("bodyweight-plus: the belt picture carries the bodyweight caption; a cable shows its pin step and speaks the pin", () => {
    const { unmount } = render(<Harness exercise={ex("BODYWEIGHT", "BODYWEIGHT_PLUS")} exerciseName="Weighted Pull Ups" bodyweightKg={82.5} initial={{ weightKg: 20 }} />);
    expect(screen.getByRole("img", { name: "Dip belt with 20 kilograms hanging" })).toBeInTheDocument();
    expect(document.querySelector(".eq__caption")).toHaveTextContent(/^On the belt\s*20\s*Added to 82\.5 kg bodyweight$/);
    expect(slider()).toHaveAttribute("aria-valuetext", "20 kilograms added");
    unmount();
    render(<Harness exercise={ex("CABLE", "STACK")} exerciseName="Cable Rope Overhead Triceps Extension" initial={{ weightKg: 22.5 }} />);
    expect(screen.getByText(/Cable · 2\.5 kg pin step · set 1 of 4/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Cable column with a rope, the pin at plate 9/ })).toBeInTheDocument();
    expect(slider()).toHaveAttribute("aria-valuetext", "Pin 9, 22.5 kilograms");
  });

  it("writes dial turns through weightPatch in kg", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    slider().focus();
    await userEvent.keyboard("{ArrowRight}");
    // A key step is committed after a short pause, once.
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ weightKg: 102.5, inputUnit: "KG" }));
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ weightKg: 97.5, inputUnit: "KG" }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("writes dial turns in pounds, stored as kg with the unit it was entered in", async () => {
    const onChange = vi.fn();
    render(<Harness unit="LB" initial={{ weightKg: 61.235, inputUnit: "LB" }} onChange={onChange} />);
    expect(slider()).toHaveAttribute("aria-valuetext", "135 pounds total");
    slider().focus();
    await userEvent.keyboard("{ArrowRight}");
    // 135 lb -> 140 lb (a 45 lb bar and 2.5 lb plates step by 5 lb)
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ weightKg: 63.503, inputUnit: "LB" }));
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

  it("a typed weight is saved when the page is hidden or unloaded before it is confirmed", async () => {
    const onChange = vi.fn();
    render(<Harness exercise={ex("DUMBBELL", "PER_IMPLEMENT")} initial={{ weightKg: 32 }} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 32, tap to type/ }));
    await userEvent.keyboard("31");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 31, inputUnit: "KG" });
    expect(screen.getByRole("button", { name: /^Set 1 weight 31, tap to type/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 31, tap to type/ }));
    await userEvent.keyboard("{Control>}a{/Control}30");
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 30, inputUnit: "KG" });
  });

  it("a typed weight is saved once on unmount, and not again by a later blur or page hide", async () => {
    const onChange = vi.fn();
    const { unmount } = render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /^Set 1 weight 100, tap to type/ }));
    await userEvent.keyboard("{Control>}a{/Control}105");
    unmount();
    window.dispatchEvent(new Event("pagehide"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ weightKg: 105, inputUnit: "KG" });
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
    await vi.waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ reps: 6 }));
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

  describe("live value, one write", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("the readout, the picture and the Log label follow a key step at once; the write comes once, after the pause", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      slider().focus();
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      expect(screen.getByRole("button", { name: /^Set 1 weight 105, tap to type/ })).toHaveTextContent("105");
      expect(screen.getByRole("button", { name: "Log set · 105 kg × 5" })).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(300));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith({ weightKg: 105, inputUnit: "KG" });
    });

    it("Log set writes a pending dial value before it completes the set", () => {
      const calls: string[] = [];
      render(<Harness onChange={(p) => calls.push(`change ${JSON.stringify(p)}`)} onToggleComplete={() => calls.push("toggle")} />);
      slider().focus();
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      fireEvent.click(screen.getByRole("button", { name: "Log set · 102.5 kg × 5" }));
      expect(calls).toEqual(['change {"weightKg":102.5,"inputUnit":"KG"}', "toggle"]);
    });

    it("a pending reps value is written before Log set too", () => {
      const calls: string[] = [];
      render(<Harness onChange={(p) => calls.push(`change ${JSON.stringify(p)}`)} onToggleComplete={() => calls.push("toggle")} />);
      screen.getByRole("spinbutton", { name: "Set 1 reps" }).focus();
      fireEvent.keyDown(screen.getByRole("spinbutton", { name: "Set 1 reps" }), { key: "ArrowRight" });
      fireEvent.click(screen.getByRole("button", { name: "Log set · 100 kg × 6" }));
      expect(calls).toEqual(['change {"reps":6}', "toggle"]);
    });

    it("a pending value is written when the page is hidden", () => {
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);
      slider().focus();
      fireEvent.keyDown(slider(), { key: "ArrowRight" });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      expect(onChange).toHaveBeenCalledWith({ weightKg: 102.5, inputUnit: "KG" });
    });
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
  type DrawOpts = { unit?: WeightUnit; step?: number; machine?: Parameters<typeof dialSetup>[0]["machine"]; isUnilateral?: boolean; name?: string; bodyweight?: number | null };
  const picture = (equipment: Equipment, loadType: LoadType, value: number | null, opts: DrawOpts = {}) => {
    const unit = opts.unit ?? "KG";
    const exercise = ex(equipment, loadType, opts.isUnilateral);
    const setup = dialSetup({ exercise, unit, step: opts.step ?? (unit === "KG" ? 2.5 : 5), current: value, machine: opts.machine ?? null });
    if (!setup.kind) throw new Error("no picture");
    return <EquipmentPicture kind={setup.kind} loadType={loadType} isUnilateral={exercise.isUnilateral} name={opts.name} setup={setup} value={value} hasProfile={opts.machine != null} bodyweight={opts.bodyweight} />;
  };
  const draw = (equipment: Equipment, loadType: LoadType, value: number | null, opts: DrawOpts = {}) => render(picture(equipment, loadType, value, opts));
  const caption = (container: HTMLElement) => container.querySelector(".eq__caption");

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

  it("without a weight yet the caption prompts instead of describing a default weight", () => {
    for (const [equipment, loadType] of [["DUMBBELL", "PER_IMPLEMENT"], ["KETTLEBELL", "TOTAL"], ["MACHINE_SELECTORIZED", "STACK"]] as const) {
      const view = draw(equipment, loadType, null);
      expect(view.container.querySelector(".eq__caption")).toHaveTextContent("Turn the dial to choose a weight");
      expect(view.container.querySelector(".eq__caption")).not.toHaveTextContent(/total|kg/);
      view.unmount();
    }
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

  it("weight stack: plates lift with a 22 ms stagger from the old pin, and the delays reset for the next turn", () => {
    const { container, rerender } = draw("MACHINE_SELECTORIZED", "STACK", 45, { step: 5 });
    rerender(picture("MACHINE_SELECTORIZED", "STACK", 60, { step: 5 }));
    const plates = [...container.querySelectorAll<SVGRectElement>(".eq-sp")];
    expect(container.querySelectorAll(".eq-sp.is-on")).toHaveLength(12);
    expect(plates.slice(8, 13).map((p) => p.style.transitionDelay)).toEqual(["0ms", "0ms", "22ms", "44ms", "0ms"]);
    rerender(picture("MACHINE_SELECTORIZED", "STACK", 50, { step: 5 }));
    // dropping from 12 to 10: plate 12 first, then 11
    expect(plates.slice(9, 12).map((p) => p.style.transitionDelay)).toEqual(["0ms", "22ms", "0ms"]);
  });

  it("has a picture for cables, bodyweight-plus, plates and medicine balls, none for bands or strongman kit", () => {
    const kind = (equipment: Equipment, loadType: LoadType) => dialSetup({ exercise: ex(equipment, loadType), unit: "KG", step: 2.5, current: 10, machine: null }).kind;
    expect(kind("CABLE", "STACK")).toBe("cable");
    expect(kind("BODYWEIGHT", "BODYWEIGHT_PLUS")).toBe("belt");
    expect(kind("PLATE", "TOTAL")).toBe("plate");
    expect(kind("MEDICINE_BALL", "TOTAL")).toBe("medicine-ball");
    expect(kind("MACHINE_SELECTORIZED", "STACK")).toBe("stack");
    expect(kind("OTHER", "TOTAL")).toBeNull();
    expect(kind("BAND", "TOTAL")).toBeNull();
    // the cable dial keeps the stack's range and base load
    expect(dialSetup({ exercise: ex("CABLE", "STACK"), unit: "KG", step: 2.5, current: null, machine: { pinStepKg: 2.5, baseLoadKg: 5 } })).toMatchObject({ bar: 5, max: 250, restValue: 5 });
  });

  it("cable: the column with the exercise's attachment, plates lifted for the pin, and the pin in the caption", () => {
    const { container, rerender } = draw("CABLE", "STACK", 22.5, { name: "Triceps Pushdown - Rope Attachment", machine: { pinStepKg: 2.5, baseLoadKg: null } });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Cable column with a rope, the pin at plate 9, 22.5 kilograms");
    expect(container.querySelector(".eq-cable-art .eq-att--rope")).not.toBeNull();
    expect(container.querySelectorAll(".eq-tower ~ .eq-sp")).toHaveLength(10);
    // one drawn plate per two pins
    expect(container.querySelectorAll(".eq-sp.is-on")).toHaveLength(5);
    // the tower draws ten plates, so no "of 20" even with a machine profile
    expect(caption(container)).toHaveTextContent(/^Pin 9 · 22\.5 kg · 2\.5 kg per plate$/);
    rerender(picture("CABLE", "STACK", 32.5, { name: "Triceps Pushdown - Rope Attachment", machine: { pinStepKg: 2.5, baseLoadKg: null } }));
    expect(container.querySelectorAll(".eq-sp.is-on")).toHaveLength(7);
    expect([...container.querySelectorAll<SVGRectElement>(".eq-sp")].slice(5, 7).map((p) => p.style.transitionDelay)).toEqual(["0ms", "22ms"]);
  });

  it("cable: a lat pulldown hangs the lat bar, an unnamed cable the D-handle, and no weight yet prompts", () => {
    const lat = draw("CABLE", "STACK", 40, { name: "Wide-Grip Lat Pulldown" });
    expect(screen.getByRole("img", { name: /^Cable column with a lat bar/ })).toBeInTheDocument();
    lat.unmount();
    const plain = draw("CABLE", "STACK", null);
    expect(screen.getByRole("img", { name: /^Cable column with a D-handle/ })).toBeInTheDocument();
    expect(plain.container.querySelector(".eq")).toHaveClass("eq--ghost");
    expect(caption(plain.container)).toHaveTextContent("Turn the dial to choose a weight");
  });

  it("bodyweight-plus: the added plates hang from a dip belt, with the workout's bodyweight", () => {
    const { container } = draw("BODYWEIGHT", "BODYWEIGHT_PLUS", 25, { name: "Weighted Pull Ups", bodyweight: 82.5 });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Dip belt with 25 kilograms hanging");
    expect(container.querySelector(".eq-belt .eq-plate--face")).toHaveAttribute("data-tone", "red");
    expect(caption(container)).toHaveTextContent(/^On the belt\s*25\s*Added to 82\.5 kg bodyweight$/);
    const mixed = draw("BODYWEIGHT", "BODYWEIGHT_PLUS", 27.5, { name: "Weighted Pull Ups" });
    expect(mixed.container.querySelectorAll(".eq-belt .eq-plate--face")).toHaveLength(2);
    expect(caption(mixed.container)).toHaveTextContent(/^On the belt\s*25\s*\+\s*2\.5$/);
  });

  it("bodyweight-plus with nothing added draws the apparatus, not an empty belt", () => {
    const zero = draw("BODYWEIGHT", "BODYWEIGHT_PLUS", 0, { name: "Dips - Triceps Version", bodyweight: 82.5 });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Dip bars, nothing added");
    expect(zero.container.querySelector(".eq-belt")).toBeNull();
    expect(caption(zero.container)).toHaveTextContent("Bodyweight only · 82.5 kg");
    zero.unmount();
    const ghost = draw("BODYWEIGHT", "BODYWEIGHT_PLUS", null, { name: "Pullups" });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Pull-up bar, nothing added");
    expect(ghost.container.querySelector(".eq")).toHaveClass("eq--ghost");
    expect(caption(ghost.container)).toHaveTextContent("Turn the dial to add weight");
  });

  it("plate: the plate for the weight, in its colour, and plates that make it up when no single plate does", () => {
    const one = draw("PLATE", "TOTAL", 20, { name: "Front Plate Raise" });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "A 20 kilogram plate");
    expect(one.container.querySelector(".eq-plate-art .eq-plate--face")).toHaveAttribute("data-tone", "blue");
    expect(caption(one.container)).toHaveTextContent(/^One 20 kg plate$/);
    expect(caption(one.container)?.querySelector(".eq__dot")).toHaveAttribute("data-tone", "blue");
    one.unmount();
    const two = draw("PLATE", "TOTAL", 12.5);
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "Plates of 10, 2.5 kilograms");
    expect(two.container.querySelector(".eq-plate--face")).toHaveAttribute("data-tone", "green");
    expect(caption(two.container)).toHaveTextContent(/^Plates\s*10\s*\+\s*2\.5$/);
    two.unmount();
    const off = draw("PLATE", "TOTAL", 11);
    expect(caption(off.container)).toHaveTextContent("11 kg can’t be loaded exactly · nearest 10 kg");
    off.unmount();
    const lb = draw("PLATE", "TOTAL", 45, { unit: "LB" });
    expect(caption(lb.container)).toHaveTextContent("One 45 lb plate");
    lb.unmount();
    const ghost = draw("PLATE", "TOTAL", null);
    expect(caption(ghost.container)).toHaveTextContent("Turn the dial to choose a weight");
    // faded, at a typical plate rather than the dial's first value
    expect(ghost.container.querySelector(".eq")).toHaveClass("eq--ghost");
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "A 20 kilogram plate");
  });

  it("medicine ball: the ball with its weight printed on it; no number before a weight is chosen", () => {
    const ball = draw("MEDICINE_BALL", "TOTAL", 6, { name: "Overhead Slam", step: 1 });
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", "A medicine ball, 6 kilograms");
    expect(ball.container.querySelector(".eq-ball__num")).toHaveTextContent("6");
    expect(caption(ball.container)).toHaveTextContent(/^6 kg ball$/);
    ball.unmount();
    const ghost = draw("MEDICINE_BALL", "TOTAL", null);
    expect(ghost.container.querySelector(".eq-medball")).not.toBeNull();
    expect(ghost.container.querySelector(".eq-ball__num")).toBeNull();
    expect(caption(ghost.container)).toHaveTextContent("Turn the dial to choose a weight");
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
