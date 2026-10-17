import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dial, type DialProps } from "./Dial";
import { NumberStrip, type NumberStripProps } from "./NumberStrip";

const WEIGHTS = [20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5];
const text = (v: number) => `${v} kilograms`;

function DialHarness({ initial = 25, values = WEIGHTS, onDetent, ...rest }: { initial?: number | null; values?: readonly number[] } & Partial<DialProps>) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <Dial label="Set 1 weight" values={values} value={v} onChange={setV} valueText={text} onDetent={onDetent} {...rest} />
      <output data-testid="out">{v === null ? "null" : v}</output>
    </>
  );
}

const range = () => screen.getByRole("slider", { name: "Set 1 weight" }) as HTMLInputElement;
const out = () => screen.getByTestId("out");
const rotation = (container: HTMLElement) => container.querySelector<SVGGElement>(".dial__rot")!.style.transform;

describe("Dial", () => {
  it("renders a native range as the source of truth and hides the drawing from assistive tech", () => {
    const { container } = render(<DialHarness />);
    const r = range();
    expect(r.tagName).toBe("INPUT");
    expect(r).toHaveAttribute("type", "range");
    expect(r).toHaveAttribute("min", "0");
    expect(r).toHaveAttribute("max", String(WEIGHTS.length - 1));
    expect(r).toHaveAttribute("step", "1");
    expect(r).toHaveValue("2");
    expect(r).toHaveAttribute("aria-valuetext", "25 kilograms");
    expect(r).toHaveClass("sr-only");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(rotation(container)).toBe("rotate(24deg)");
  });

  it("steps with the arrow keys, Page Up/Down (4) and Home/End, and keeps the range in sync", async () => {
    render(<DialHarness initial={20} />);
    range().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(out()).toHaveTextContent("22.5");
    expect(range()).toHaveValue("1");
    expect(range()).toHaveAttribute("aria-valuetext", "22.5 kilograms");
    await userEvent.keyboard("{ArrowUp}");
    expect(out()).toHaveTextContent("25");
    await userEvent.keyboard("{ArrowLeft}{ArrowDown}");
    expect(out()).toHaveTextContent("20");
    await userEvent.keyboard("{PageUp}");
    expect(out()).toHaveTextContent("30");
    await userEvent.keyboard("{PageDown}");
    expect(out()).toHaveTextContent("20");
    await userEvent.keyboard("{End}");
    expect(out()).toHaveTextContent("42.5");
    await userEvent.keyboard("{Home}");
    expect(out()).toHaveTextContent("20");
  });

  it("follows assistive-tech changes of the range", () => {
    render(<DialHarness initial={20} />);
    fireEvent.change(range(), { target: { value: "5" } });
    expect(out()).toHaveTextContent("32.5");
    expect(range()).toHaveValue("5");
  });

  it("stops at the limits: no change, no detent, and a bump is played", async () => {
    const onDetent = vi.fn();
    const { container } = render(<DialHarness initial={20} onDetent={onDetent} />);
    range().focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(out()).toHaveTextContent("20");
    expect(onDetent).not.toHaveBeenCalled();
    expect(container.querySelector(".dial__bump")).toHaveAttribute("data-bump", "down");
    await userEvent.keyboard("{End}{ArrowRight}");
    expect(out()).toHaveTextContent("42.5");
    expect(container.querySelector(".dial__bump")).toHaveAttribute("data-bump", "up");
    // End: nine detents went up; the extra ArrowRight at the limit did not add one.
    expect(onDetent).toHaveBeenCalledTimes(9);
  });

  it("discards the part of a Page Up that goes past the end", async () => {
    const onDetent = vi.fn();
    const { container } = render(<DialHarness initial={40} onDetent={onDetent} />);
    range().focus();
    await userEvent.keyboard("{PageUp}");
    expect(out()).toHaveTextContent("42.5");
    expect(onDetent).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".dial__bump")).toHaveAttribute("data-bump", "up");
  });

  it("fires onDetent once per detent with the direction turned", async () => {
    const dirs: (1 | -1)[] = [];
    render(<DialHarness initial={30} onDetent={(d) => dirs.push(d)} />);
    range().focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}{ArrowLeft}");
    expect(dirs).toEqual([1, 1, -1]);
    await userEvent.keyboard("{PageDown}");
    expect(dirs.slice(3)).toEqual([-1, -1, -1, -1]);
  });

  it("rests at restIndex while the value is null and the first detent sets a value", async () => {
    const { container } = render(<DialHarness initial={null} restIndex={3} />);
    expect(range()).toHaveValue("3");
    expect(range()).toHaveAttribute("aria-valuetext", "Not set");
    expect(rotation(container)).toBe("rotate(36deg)");
    range().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(out()).toHaveTextContent("30");
    expect(range()).toHaveAttribute("aria-valuetext", "30 kilograms");
  });

  it("lands on the nearest value when given an off-step value", () => {
    render(<DialHarness initial={26} />);
    expect(range()).toHaveValue("2");
  });

  it("does nothing while disabled", async () => {
    const onDetent = vi.fn();
    render(<DialHarness disabled onDetent={onDetent} />);
    expect(range()).toBeDisabled();
    expect(range()).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(range(), { key: "ArrowRight" });
    expect(out()).toHaveTextContent("25");
    expect(onDetent).not.toHaveBeenCalled();
  });

  it("adds an info hint only when labelHint is given", () => {
    const { rerender } = render(<DialHarness />);
    expect(screen.queryByRole("button", { name: /What is/ })).not.toBeInTheDocument();
    rerender(<DialHarness labelHint="rir" />);
    expect(screen.getByRole("button", { name: "What is Reps in reserve (RIR)?" })).toBeInTheDocument();
  });

  it("resolves token names and CSS values for the rim and ink", () => {
    const { container, rerender } = render(<DialHarness />);
    const root = () => container.querySelector<HTMLElement>(".dial")!;
    expect(root().style.getPropertyValue("--dial-rim")).toBe("var(--color-primary)");
    expect(root().style.getPropertyValue("--dial-ink")).toBe("var(--color-primary-content)");
    rerender(<DialHarness rim="plate-red" ink="#16181a" />);
    expect(root().style.getPropertyValue("--dial-rim")).toBe("var(--plate-red)");
    expect(root().style.getPropertyValue("--dial-ink")).toBe("#16181a");
  });

  it("stamps the plate face only when a stamp is given", () => {
    const { container, rerender } = render(<DialHarness />);
    const stamps = () => Array.from(container.querySelectorAll(".dial__rot .dial__stamp")).map((n) => n.textContent);
    expect(stamps()).toEqual(["OVERLOAD"]);
    rerender(<DialHarness stamp="KG" />);
    expect(stamps()).toEqual(["OVERLOAD", "KG"]);
  });
});

describe("Dial pointer turning", () => {
  beforeEach(() => {
    // jsdom has no layout: give the face a 200x200 box at the origin, so its centre is (100, 100).
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}) });
  });
  afterEach(() => vi.restoreAllMocks());

  const point = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { clientX: 100 + Math.cos(a) * 80, clientY: 100 + Math.sin(a) * 80 };
  };
  const face = (container: HTMLElement) => container.querySelector<HTMLElement>(".dial__face")!;
  const down = (el: HTMLElement, deg: number) => fireEvent.pointerDown(el, { pointerId: 1, pointerType: "touch", button: 0, ...point(deg) });
  const move = (el: HTMLElement, deg: number) => fireEvent.pointerMove(el, { pointerId: 1, pointerType: "touch", ...point(deg) });
  const up = (el: HTMLElement) => fireEvent.pointerUp(el, { pointerId: 1, pointerType: "touch" });

  it("turns clockwise to increase, one value per detent (12 degrees)", () => {
    const dirs: (1 | -1)[] = [];
    const { container } = render(<DialHarness initial={20} onDetent={(d) => dirs.push(d)} />);
    const f = face(container);
    down(f, -90);
    move(f, -85); // 5 degrees: not a detent yet
    expect(out()).toHaveTextContent("20");
    move(f, -75); // 15 degrees: one detent, 3 degrees carried over
    expect(out()).toHaveTextContent("22.5");
    move(f, -45); // 30 degrees more (33 with the carry): two more detents
    expect(out()).toHaveTextContent("27.5");
    expect(dirs).toEqual([1, 1, 1]);
    expect(f).toHaveAttribute("data-dragging", "true");
    // No tween while dragging; the rotation follows the index.
    expect(container.querySelector(".dial__rot")).not.toHaveAttribute("data-tween");
    expect(rotation(container)).toBe("rotate(36deg)");
    up(f);
    expect(f).not.toHaveAttribute("data-dragging");
  });

  it("turns counter-clockwise to decrease and tracks across the 180 degree seam", () => {
    const { container } = render(<DialHarness initial={30} />);
    const f = face(container);
    down(f, 170);
    move(f, 185); // atan2 reports -175: a 15 degree clockwise turn through the seam
    expect(out()).toHaveTextContent("32.5");
    move(f, 160); // from -175 back to 160: 25 degrees counter-clockwise, one detent down
    expect(out()).toHaveTextContent("30");
    up(f);
  });

  it("throws away rotation past the end, bumps, and does not fire onDetent there", () => {
    const onDetent = vi.fn();
    const { container } = render(<DialHarness initial={40} onDetent={onDetent} />);
    const f = face(container);
    down(f, -90);
    move(f, -70); // one detent to 42.5 (the last value)
    expect(out()).toHaveTextContent("42.5");
    expect(onDetent).toHaveBeenCalledTimes(1);
    move(f, -40); // 30 more degrees clockwise: all thrown away
    expect(out()).toHaveTextContent("42.5");
    expect(onDetent).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".dial__bump")).toHaveAttribute("data-bump", "up");
    // The backlog was discarded: a 15 degree turn back is one detent down straight away.
    move(f, -55);
    expect(out()).toHaveTextContent("40");
    up(f);
  });

  it("ignores pointers when disabled", () => {
    const { container } = render(<DialHarness initial={20} disabled />);
    const f = face(container);
    down(f, -90);
    move(f, -40);
    expect(out()).toHaveTextContent("20");
  });

  it("focuses the range on press so the keyboard and wheel work after a click", () => {
    const { container } = render(<DialHarness />);
    down(face(container), -90);
    expect(range()).toHaveFocus();
  });

  it("steps with the mouse wheel only while focused, 30px per detent, and tweens", () => {
    const { container } = render(<DialHarness initial={20} />);
    const f = face(container);
    // Not focused: the wheel is left to the page.
    const free = new WheelEvent("wheel", { deltaY: -90, cancelable: true, bubbles: true });
    act(() => {
      f.dispatchEvent(free);
    });
    expect(free.defaultPrevented).toBe(false);
    expect(out()).toHaveTextContent("20");
    range().focus();
    const e1 = new WheelEvent("wheel", { deltaY: -20, cancelable: true, bubbles: true });
    act(() => {
      f.dispatchEvent(e1);
    });
    expect(e1.defaultPrevented).toBe(true);
    expect(out()).toHaveTextContent("20"); // 20 px: not a detent yet
    const e2 = new WheelEvent("wheel", { deltaY: -45, cancelable: true, bubbles: true });
    act(() => {
      f.dispatchEvent(e2);
    });
    expect(out()).toHaveTextContent("25"); // 65 px accumulated: two detents
    expect(container.querySelector(".dial__rot")).toHaveAttribute("data-tween", "true");
  });
});

function StripHarness({ initial = 5, values = Array.from({ length: 12 }, (_, i) => i + 1), ...rest }: { initial?: number | null; values?: readonly number[] } & Partial<NumberStripProps>) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <>
      <NumberStrip label="Reps" values={values} value={v} onChange={setV} {...rest} />
      <button type="button" onClick={() => setV(9)}>
        external
      </button>
      <output data-testid="out">{v === null ? "null" : v}</output>
    </>
  );
}

const strip = () => screen.getByRole("spinbutton", { name: "Reps" });

describe("NumberStrip", () => {
  it("is a spinbutton with the value, its spoken text and a selected item", () => {
    render(<StripHarness valueText={(v) => `${v} reps`} />);
    expect(strip()).toHaveAttribute("aria-valuenow", "5");
    expect(strip()).toHaveAttribute("aria-valuemin", "1");
    expect(strip()).toHaveAttribute("aria-valuemax", "12");
    expect(strip()).toHaveAttribute("aria-valuetext", "5 reps");
    expect(strip().querySelector(".is-sel")).toHaveTextContent("5");
  });

  it("steps with the arrow keys, Page Up/Down (5) and Home/End, clamping at the ends", async () => {
    render(<StripHarness initial={5} />);
    strip().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("out")).toHaveTextContent("6");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByTestId("out")).toHaveTextContent("5");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByTestId("out")).toHaveTextContent("6");
    await userEvent.keyboard("{PageUp}");
    expect(screen.getByTestId("out")).toHaveTextContent("11");
    await userEvent.keyboard("{PageUp}");
    expect(screen.getByTestId("out")).toHaveTextContent("12");
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("out")).toHaveTextContent("12");
    await userEvent.keyboard("{Home}");
    expect(screen.getByTestId("out")).toHaveTextContent("1");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("out")).toHaveTextContent("1");
    await userEvent.keyboard("{PageDown}{End}");
    expect(screen.getByTestId("out")).toHaveTextContent("12");
  });

  it("selects an item when it is clicked", async () => {
    render(<StripHarness initial={5} />);
    await userEvent.click(strip().querySelectorAll(".numstrip__item")[7]!);
    expect(screen.getByTestId("out")).toHaveTextContent("8");
  });

  it("stays in sync when value changes from outside, and re-centres on it", async () => {
    render(<StripHarness initial={5} itemSize={40} />);
    const sc = strip();
    expect(sc.scrollLeft).toBe(4 * 40);
    await userEvent.click(screen.getByRole("button", { name: "external" }));
    expect(strip()).toHaveAttribute("aria-valuenow", "9");
    expect(strip().querySelector(".is-sel")).toHaveTextContent("9");
    expect(sc.scrollLeft).toBe(8 * 40);
  });

  it("re-centres when the strip is resized", () => {
    const observers: (() => void)[] = [];
    class RO {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", RO);
    try {
      render(<StripHarness initial={5} itemSize={40} />);
      strip().scrollLeft = 0;
      act(() => observers.forEach((cb) => cb()));
      expect(strip().scrollLeft).toBe(4 * 40);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports the centred item after a native scroll", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    render(<StripHarness initial={5} itemSize={40} />);
    strip().scrollLeft = 6 * 40 + 8; // nearest to index 6, i.e. the value 7
    fireEvent.scroll(strip());
    expect(screen.getByTestId("out")).toHaveTextContent("7");
    vi.restoreAllMocks();
  });

  it("a late scrollend from the scroll that a key press replaced does not undo that press", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    try {
      render(<StripHarness initial={3} itemSize={40} />);
      const sc = strip();
      sc.scrollTo = vi.fn(); // a browser animates the scroll; here nothing moves until the test moves it
      sc.focus();
      fireEvent.keyDown(sc, { key: "ArrowRight" }); // 4, scrolling toward index 3
      fireEvent.keyDown(sc, { key: "ArrowRight" }); // 5, scrolling toward index 4 (replaces the first scroll)
      expect(screen.getByTestId("out")).toHaveTextContent("5");
      // The first animation finished a moment ago, and its scrollend is delivered while the second one is only starting. Scroll events
      // on the way (still at index 3) must not be taken for a lifter's scroll, and the press must still count.
      sc.scrollLeft = 3 * 40;
      fireEvent(sc, new Event("scrollend"));
      fireEvent.scroll(sc);
      expect(screen.getByTestId("out")).toHaveTextContent("5");
      fireEvent.keyDown(sc, { key: "ArrowRight" });
      expect(screen.getByTestId("out")).toHaveTextContent("6");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("drags with the mouse, snaps to the nearest item on release and ignores the click that follows", () => {
    render(<StripHarness initial={5} itemSize={40} />);
    const sc = strip();
    expect(sc.scrollLeft).toBe(160);
    fireEvent.pointerDown(sc, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300 });
    fireEvent.pointerMove(sc, { pointerId: 1, pointerType: "mouse", clientX: 298 }); // under the 3px threshold: still a click
    expect(sc).not.toHaveAttribute("data-dragging");
    fireEvent.pointerMove(sc, { pointerId: 1, pointerType: "mouse", clientX: 220 });
    expect(sc).toHaveAttribute("data-dragging", "true");
    expect(sc.scrollLeft).toBe(160 + 80);
    fireEvent.pointerUp(sc, { pointerId: 1, pointerType: "mouse", clientX: 220 });
    expect(sc).not.toHaveAttribute("data-dragging");
    expect(screen.getByTestId("out")).toHaveTextContent("7");
    fireEvent.click(sc.querySelectorAll(".numstrip__item")[0]!);
    expect(screen.getByTestId("out")).toHaveTextContent("7");
  });

  it("rests with nothing selected while the value is null, and the first key sets one", async () => {
    render(<StripHarness initial={null} />);
    expect(strip()).not.toHaveAttribute("aria-valuenow");
    expect(strip().querySelector(".is-sel")).toBeNull();
    strip().focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByTestId("out")).toHaveTextContent("1");
  });

  it("does nothing while disabled", () => {
    render(<StripHarness disabled />);
    expect(strip()).toHaveAttribute("aria-disabled", "true");
    expect(strip()).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    expect(screen.getByTestId("out")).toHaveTextContent("5");
  });

  it("is not a scrollable region while disabled (it is not focusable, axe scrollable-region-focusable)", () => {
    const { rerender } = render(<StripHarness disabled />);
    expect(strip().style.overflowX).toBe("hidden");
    rerender(<StripHarness />);
    expect(strip().style.overflowX).toBe("");
  });
});

// The real value round-trips through a store (Dexie), so it comes back a moment after onChange. Key presses made in that gap
// must still add up (they were dropped when the component re-read its position from the lagging prop on every render).
function LaggingValue({ initial, children }: { initial: number; children: (v: number, set: (n: number) => void) => ReactNode }) {
  const [v, setV] = useState(initial);
  const set = (n: number) => void setTimeout(() => setV(n), 20);
  return <>{children(v, set)}</>;
}

describe("a value that comes back late", () => {
  it("Dial: five quick key presses before the first echo all count", async () => {
    render(<LaggingValue initial={20}>{(v, set) => <Dial label="Set 1 weight" values={WEIGHTS} value={v} onChange={set} valueText={text} />}</LaggingValue>);
    range().focus();
    for (const key of ["Home", "PageUp", "PageUp", "ArrowRight", "ArrowRight"]) fireEvent.keyDown(range(), { key });
    // Home = index 0 (20), two PageUp = index 8 (40), two ArrowRight = index 10, clamped at the last value (42.5)
    await vi.waitFor(() => expect(range()).toHaveAttribute("aria-valuetext", "42.5 kilograms"));
  });

  it("NumberStrip: quick key presses before the first echo all count, and an outside change still re-centres", async () => {
    const values = Array.from({ length: 12 }, (_, i) => i + 1);
    render(
      <LaggingValue initial={1}>
        {(v, set) => (
          <>
            <NumberStrip label="Reps" values={values} value={v} onChange={set} />
            <button type="button" onClick={() => set(9)}>
              external
            </button>
          </>
        )}
      </LaggingValue>,
    );
    strip().focus();
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(strip(), { key: "ArrowRight" });
      await new Promise((r) => setTimeout(r, 12)); // echoes (20 ms late) land between the presses
    }
    await vi.waitFor(() => expect(strip()).toHaveAttribute("aria-valuenow", "6"));
    await userEvent.click(screen.getByRole("button", { name: "external" }));
    await vi.waitFor(() => expect(strip()).toHaveAttribute("aria-valuenow", "9"));
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    await vi.waitFor(() => expect(strip()).toHaveAttribute("aria-valuenow", "10"));
  });
});
