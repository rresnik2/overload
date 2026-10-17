import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ExerciseTab, type ExerciseTabItem } from "./ExerciseTab";
import { EXERCISE_TAB_SIDE_KEY, readExerciseTabSide, setExerciseTabSide, useExerciseTabSide } from "./exerciseTabSide";
import { scrollExerciseIntoView, useScrollIntoViewOnFocus } from "./scrollToExercise";
import { ExerciseTabSetting } from "@/components/profile/ExerciseTabSetting";

const ITEMS: ExerciseTabItem[] = [
  { id: "a", name: "Squat", done: 4, total: 4 },
  { id: "b", name: "Bench press", done: 3, total: 4 },
  { id: "c", name: "Row", done: 0, total: 3 },
  { id: "d", name: "Curl", done: 0, total: 3 },
  { id: "e", name: "Plank", done: 0, total: 2 },
];

function mockLayout(dial: boolean, reduced = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : dial,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

function Harness({ start, items = ITEMS }: { start: number; items?: ExerciseTabItem[] }) {
  const [index, setIndex] = useState(start);
  return (
    <>
      <ExerciseTab items={items} index={index} onGo={setIndex} />
      <p data-testid="focused">{items[index]?.name ?? "none"}</p>
    </>
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
beforeEach(() => {
  window.localStorage.clear();
  mockLayout(true);
});
afterEach(() => vi.restoreAllMocks());

describe("ExerciseTab", () => {
  it("names the exercise each chevron goes to and the count opens the jump list", () => {
    render(<Harness start={1} />);
    expect(screen.getByRole("button", { name: "Previous exercise: Squat" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next exercise: Row" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Jump to an exercise, 2 of 5" })).toHaveTextContent("2/5");
  });

  it("moves focus through the exercises and disables the ends (no wrap-around)", async () => {
    const user = userEvent.setup();
    render(<Harness start={0} />);
    const prev = () => screen.getByRole("button", { name: /^Previous exercise/ });
    const next = () => screen.getByRole("button", { name: /^Next exercise/ });
    expect(prev()).toBeDisabled();
    await user.click(next());
    expect(screen.getByTestId("focused")).toHaveTextContent("Bench press");
    await user.click(prev());
    expect(screen.getByTestId("focused")).toHaveTextContent("Squat");
    for (let i = 0; i < 4; i++) await user.click(next());
    expect(screen.getByTestId("focused")).toHaveTextContent("Plank");
    expect(next()).toBeDisabled();
    expect(prev()).toBeEnabled();
  });

  it("with every exercise done, Previous goes to the last one", async () => {
    const user = userEvent.setup();
    render(<Harness start={-1} />);
    expect(screen.getByRole("button", { name: /^Next exercise/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous exercise: Plank" }));
    expect(screen.getByTestId("focused")).toHaveTextContent("Plank");
  });

  it("jump list shows each exercise with its sets, marks the focused one and focuses the chosen one", async () => {
    const user = userEvent.setup();
    render(<Harness start={1} />);
    await user.click(screen.getByRole("button", { name: /^Jump to an exercise/ }));
    const dialog = screen.getByRole("dialog", { name: "Jump to an exercise" });
    const rows = within(dialog).getAllByRole("button", { name: /sets? done$/ });
    expect(rows).toHaveLength(5);
    expect(rows[1]).toHaveAttribute("aria-current", "true");
    expect(rows[1]).toHaveTextContent("3/4 sets");
    expect(rows[1]).toHaveAccessibleName(/, 3 of 4 sets done$/);
    expect(rows[0]).not.toHaveAttribute("aria-current");
    await user.click(within(dialog).getByRole("button", { name: /Row/ }));
    expect(screen.getByTestId("focused")).toHaveTextContent("Row");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is hidden with fewer than two exercises and on a desktop", () => {
    const { unmount } = render(<Harness start={0} items={ITEMS.slice(0, 1)} />);
    expect(screen.queryByRole("navigation", { name: "Exercises" })).not.toBeInTheDocument();
    unmount();
    mockLayout(false);
    render(<Harness start={0} />);
    expect(screen.queryByRole("navigation", { name: "Exercises" })).not.toBeInTheDocument();
  });

  it("sits on the right by default, on the left when chosen, and moves live", () => {
    render(<Harness start={0} />);
    const nav = screen.getByRole("navigation", { name: "Exercises" });
    expect(nav).toHaveAttribute("data-side", "right");
    act(() => setExerciseTabSide("left"));
    expect(nav).toHaveAttribute("data-side", "left");
    act(() => setExerciseTabSide("right"));
    expect(nav).toHaveAttribute("data-side", "right");
  });
});

describe("exercise tab side store", () => {
  it("defaults to right, persists left and clears on right", () => {
    expect(readExerciseTabSide()).toBe("right");
    setExerciseTabSide("left");
    expect(window.localStorage.getItem(EXERCISE_TAB_SIDE_KEY)).toBe("left");
    expect(readExerciseTabSide()).toBe("left");
    setExerciseTabSide("right");
    expect(readExerciseTabSide()).toBe("right");
  });

  it("survives a throwing localStorage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readExerciseTabSide()).toBe("right");
    expect(() => setExerciseTabSide("left")).not.toThrow();
    const { result } = renderHook(() => useExerciseTabSide());
    expect(result.current).toBe("right");
  });

  it("the Settings control reflects the side, writes it and updates other readers", async () => {
    const user = userEvent.setup();
    render(<ExerciseTabSetting />);
    expect(screen.getByRole("radio", { name: "Right" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Left" }));
    expect(screen.getByRole("radio", { name: "Left" })).toBeChecked();
    expect(readExerciseTabSide()).toBe("left");
  });
});

describe("scrolling a newly focused exercise into view", () => {
  function Block({ focused, enabled = true, onMount = false }: { focused: boolean; enabled?: boolean; onMount?: boolean }) {
    const ref = useRef<HTMLElement>(null);
    useScrollIntoViewOnFocus(ref, focused, enabled, onMount);
    return <section ref={ref} />;
  }
  let scroll: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll as unknown as typeof Element.prototype.scrollIntoView;
  });

  it("scrolls when focus arrives, not on first render, not when disabled", () => {
    const { rerender } = render(<Block focused />);
    expect(scroll).not.toHaveBeenCalled();
    rerender(<Block focused={false} />);
    rerender(<Block focused />);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    rerender(<Block focused={false} enabled={false} />);
    rerender(<Block focused enabled={false} />);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("scrolls a just-added exercise once it is focused and can show its panel, and only once", () => {
    const { rerender } = render(<Block focused enabled={false} onMount />);
    expect(scroll).not.toHaveBeenCalled(); // the dial layout is not on yet
    rerender(<Block focused onMount />);
    expect(scroll).toHaveBeenCalledTimes(1);
    rerender(<Block focused onMount />);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("does not scroll an unfocused just-added exercise until it is focused", () => {
    const { rerender } = render(<Block focused={false} onMount />);
    expect(scroll).not.toHaveBeenCalled();
    rerender(<Block focused onMount />);
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it("scrolls a tall panel up to the gap under the bar, so the dial clears the sticky Log set row where it can", () => {
    const rect = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
    const bar = document.createElement("div");
    bar.className = "wk-topbar";
    bar.getBoundingClientRect = () => rect(0, 53);
    const section = document.createElement("section");
    section.innerHTML = '<div class="dial__face"></div><div class="wk-panel__logrow" style="bottom: 86px"></div>';
    document.body.append(bar, section);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    const face = section.querySelector<HTMLElement>(".dial__face")!;
    const row = section.querySelector<HTMLElement>(".wk-panel__logrow")!;
    row.getBoundingClientRect = () => rect(0, 88); // sticks at 844 - 86 - 88 = 670
    section.getBoundingClientRect = () => rect(400, 900);
    // Margin 53 + 16 = 69 moves the page 331px. A dial 440px below the section top (bottom at 840 + 187 - 331 = 696) hangs 34px
    // over the row with the 8px clearance; the exercise may rise 16px (to the bar), so it does, and no more.
    face.getBoundingClientRect = () => rect(840, 187);
    scrollExerciseIntoView(section);
    expect(parseFloat(section.style.scrollMarginTop)).toBeCloseTo(69 - 16, 5);
    // A dial 20px higher hangs 14px over the row with the clearance: it rises by exactly that.
    face.getBoundingClientRect = () => rect(820, 187);
    scrollExerciseIntoView(section);
    expect(parseFloat(section.style.scrollMarginTop)).toBeCloseTo(69 - 14, 5);
    // A dial that already clears the row asks for nothing more.
    face.getBoundingClientRect = () => rect(600, 187);
    scrollExerciseIntoView(section);
    expect(parseFloat(section.style.scrollMarginTop)).toBeCloseTo(69, 5);
    bar.remove();
    section.remove();
  });

  it("is instant under reduced motion and clears the measured sticky bar", () => {
    mockLayout(true, true);
    const bar = document.createElement("div");
    bar.className = "wk-topbar";
    bar.getBoundingClientRect = () => ({ height: 60 }) as DOMRect;
    document.body.append(bar);
    const el = document.createElement("section");
    scrollExerciseIntoView(el);
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    expect(parseFloat(el.style.scrollMarginTop)).toBeGreaterThanOrEqual(60);
    bar.remove();
  });
});
