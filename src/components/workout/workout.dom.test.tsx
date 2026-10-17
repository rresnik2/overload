import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutSetRow } from "@/contracts/entities";
import type { LoadType, TrackingType } from "@/contracts/enums";
import { useRestClock, useRestTimer } from "./hooks";
import { REST_STORAGE_KEY } from "./rest";
import { RestTimerView } from "./RestTimer";
import { SetRow, type SetRowExercise } from "./SetRow";
import { StartWorkoutCard } from "./StartWorkoutCard";

const row = (over: Partial<WorkoutSetRow> = {}): WorkoutSetRow => ({
  id: "s1",
  workoutExerciseId: "we",
  position: "a0",
  setType: "WORKING",
  weightKg: 61.235,
  inputUnit: "LB",
  reps: 8,
  rir: null,
  durationSec: null,
  distanceM: null,
  completedAt: null,
  notes: null,
  workoutId: "w",
  exerciseId: "e",
  machineProfileId: null,
  seriesKey: "e",
  localDate: "2026-10-12",
  effectiveLoadKg: 61.235,
  e1rmKg: null,
  hlc: "",
  fieldHlc: {},
  version: 0,
  deletedAt: null,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const exercise = (loadType: LoadType, tracking: TrackingType = "LOAD_REPS", equipment = "DUMBBELL"): SetRowExercise => ({ loadType, tracking, equipment: equipment as SetRowExercise["equipment"], isUnilateral: false });

const noop = () => undefined;
const renderRow = (props: Partial<React.ComponentProps<typeof SetRow>> = {}) =>
  render(
    <ul>
      <SetRow label="1" ordinal={1} set={row()} exercise={exercise("PER_IMPLEMENT")} unit="LB" step={5} effortScale="RIR" onChange={noop} onToggleComplete={noop} onDelete={noop} {...props} />
    </ul>,
  );

describe("SetRow load-type labelling", () => {
  it.each([
    ["PER_IMPLEMENT", /per hand/],
    ["PLATES_PER_SIDE", /per side/],
    ["STACK", /stack/],
    ["BODYWEIGHT_PLUS", /\+ bodyweight/],
    ["TOTAL", /total/],
  ] as const)("%s labels the weight field", (loadType, pattern) => {
    renderRow({ exercise: exercise(loadType) });
    expect(screen.getByRole("textbox", { name: pattern })).toBeInTheDocument();
    expect(document.querySelector(".wk-set__caption")?.textContent).toMatch(/^lb/);
  });

  it("shows the number in the row's unit exactly as typed (135 lb round trip) and uses the unit step", async () => {
    const onChange = vi.fn();
    renderRow({ set: row({ weightKg: 61.235, inputUnit: "LB" }), onChange, step: 5 });
    const weight = screen.getByRole("textbox", { name: /Set 1 weight/ });
    expect(weight).toHaveValue("135");
    await userEvent.click(screen.getByRole("button", { name: /Increase Set 1 weight/ }));
    // 135 lb + 5 lb = 140 lb, stored as kg with the unit it was typed in
    expect(onChange).toHaveBeenLastCalledWith({ weightKg: 63.503, inputUnit: "LB" });
  });

  it("follows the TrackingType: reps only, no weight field for bodyweight-style tracking", () => {
    const { unmount } = renderRow({ exercise: exercise("NONE", "REPS", "BODYWEIGHT") });
    expect(screen.queryByRole("textbox", { name: /weight/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Set 1 reps" })).toBeInTheDocument();
    unmount();
    renderRow({ exercise: exercise("NONE", "DURATION", "BODYWEIGHT"), set: row({ weightKg: null, reps: null, durationSec: 45 }) });
    expect(screen.getByRole("textbox", { name: /Set 1 time in seconds/ })).toHaveValue("45");
    expect(screen.queryByRole("textbox", { name: "Set 1 reps" })).toBeNull();
  });

  it("marks planned, active, completed, PR and warm-up states", () => {
    const { rerender } = renderRow();
    const li = () => document.querySelector("li.wk-set") as HTMLElement;
    expect(li()).toHaveAttribute("data-state", "planned");
    const props = { label: "1", ordinal: 1, exercise: exercise("TOTAL"), unit: "KG" as const, step: 2.5, effortScale: "RIR" as const, onChange: noop, onToggleComplete: noop, onDelete: noop };
    rerender(<ul><SetRow {...props} set={row()} active /></ul>);
    expect(li()).toHaveAttribute("data-state", "active");
    rerender(<ul><SetRow {...props} set={row({ completedAt: "2026-10-12T17:00:00.000Z" })} isPr /></ul>);
    expect(li()).toHaveAttribute("data-state", "completed");
    expect(li()).toHaveClass("wk-set--pr");
    expect(within(li()).getByText("PR")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark set 1 not done" })).toHaveAttribute("aria-pressed", "true");
    rerender(<ul><SetRow {...props} label="W" set={row({ setType: "WARMUP" })} /></ul>);
    expect(li()).toHaveClass("wk-set--warmup");
    expect(screen.queryByRole("group", { name: /RIR/ })).toBeNull(); // no effort entry on warm-ups
  });

  it("shows last time as ghost text and stores RIR for either scale", async () => {
    const onChange = vi.fn();
    const { rerender } = renderRow({ ghost: { weightKg: 61.235, reps: 8, inputUnit: "LB", durationSec: null, distanceM: null }, onChange });
    expect(screen.getByText("last 135 × 8")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set 1 RIR 2" }));
    expect(onChange).toHaveBeenLastCalledWith({ rir: 2 });
    rerender(
      <ul>
        <SetRow label="1" ordinal={1} set={row()} exercise={exercise("TOTAL")} unit="KG" step={2.5} effortScale="RPE" onChange={onChange} onToggleComplete={noop} onDelete={noop} />
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Set 1 RPE 8" }));
    expect(onChange).toHaveBeenLastCalledWith({ rir: 2 }); // RPE 8 = RIR 2, stored as RIR
  });

  it("calls back for complete and delete", async () => {
    const onToggleComplete = vi.fn();
    const onDelete = vi.fn();
    renderRow({ onToggleComplete, onDelete });
    await userEvent.click(screen.getByRole("button", { name: "Complete set 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete set 1" }));
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("RestTimerView", () => {
  const props = { durationSec: 90, onStart: noop, onPause: noop, onResume: noop, onAdjust: noop, onClear: noop };
  it("renders idle, running, paused and done", () => {
    const { rerender } = render(<RestTimerView {...props} status="idle" remainingMs={0} />);
    expect(screen.getByRole("region", { name: "Rest timer" })).toHaveAttribute("data-status", "idle");
    rerender(<RestTimerView {...props} status="running" remainingMs={65_000} />);
    expect(screen.getByTestId("rest-clock")).toHaveTextContent("1:05");
    expect(screen.getByRole("button", { name: "Pause rest" })).toBeInTheDocument();
    rerender(<RestTimerView {...props} status="paused" remainingMs={40_000} />);
    expect(screen.getByRole("button", { name: "Resume rest" })).toBeInTheDocument();
    rerender(<RestTimerView {...props} status="done" remainingMs={0} />);
    expect(screen.getByRole("button", { name: "Dismiss rest timer" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Rest timer" })).toHaveAttribute("data-status", "done");
  });
});

describe("useRestTimer (absolute restEndsAt survives a reload)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it("counts against the clock, persists, and a remounted hook finds the same end time", () => {
    vi.setSystemTime(new Date("2026-10-14T18:00:00.000Z"));
    const useBoth = () => {
      const timer = useRestTimer("w1");
      return { ...timer, ...useRestClock(timer.state) };
    };
    const first = renderHook(useBoth);
    act(() => first.result.current.start(90));
    expect(first.result.current.status).toBe("running");
    expect(JSON.parse(localStorage.getItem(REST_STORAGE_KEY) as string).endsAt).toBe(Date.parse("2026-10-14T18:01:30.000Z"));
    first.unmount(); // "reload": the page is gone, only localStorage remains
    vi.setSystemTime(new Date("2026-10-14T18:00:50.000Z")); // timers did not run while backgrounded
    const second = renderHook(useBoth);
    act(() => void vi.advanceTimersByTime(250));
    expect(second.result.current.status).toBe("running");
    expect(second.result.current.remainingMs).toBe(39_750) // 40 s left at the reload, minus the 250 ms just ticked;
    act(() => void vi.setSystemTime(new Date("2026-10-14T18:01:31.000Z")));
    act(() => void vi.advanceTimersByTime(250));
    expect(second.result.current.status).toBe("done");
    act(() => second.result.current.clear());
    expect(localStorage.getItem(REST_STORAGE_KEY)).toBeNull();
  });
});

describe("StartWorkoutCard", () => {
  const templates = [
    { id: "t1", name: "Push A", folder: null },
    { id: "t2", name: "Pull A", folder: "PPL" },
  ];
  it("starts empty or from a template", async () => {
    const onStartEmpty = vi.fn();
    const onStartFromTemplate = vi.fn();
    render(<StartWorkoutCard activeWorkout={null} templates={templates} onStartEmpty={onStartEmpty} onStartFromTemplate={onStartFromTemplate} onResume={noop} />);
    await userEvent.click(screen.getByRole("button", { name: "Start empty workout" }));
    await userEvent.click(screen.getByRole("button", { name: "Start Pull A" }));
    expect(onStartEmpty).toHaveBeenCalledTimes(1);
    expect(onStartFromTemplate).toHaveBeenCalledWith("t2");
    expect(screen.getByText("PPL / Pull A")).toBeInTheDocument();
  });

  it("offers to resume the active workout", async () => {
    const onResume = vi.fn();
    render(
      <StartWorkoutCard activeWorkout={{ id: "w", title: "Legs", startedAt: "2026-10-14T17:00:00.000Z" }} templates={templates} onStartEmpty={noop} onStartFromTemplate={noop} onResume={onResume} now={Date.parse("2026-10-14T17:12:05.000Z")} />,
    );
    expect(screen.getByText("Started 12:05 ago")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start empty workout" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Resume workout" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
