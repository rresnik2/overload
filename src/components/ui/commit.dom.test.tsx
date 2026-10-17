// Dial and NumberStrip show the value live (onChange) and hand it on once (onCommit): on release, after a pause in key steps,
// on blur, when the page is hidden and on unmount. Nothing may be lost, and nothing may be written per detent.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitHandle } from "./commit";
import { Dial } from "./Dial";
import { NumberStrip } from "./NumberStrip";

const WEIGHTS = [20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5];
const text = (v: number) => `${v} kilograms`;
const range = () => screen.getByRole("slider", { name: "Set 1 weight" }) as HTMLInputElement;

/** The stored value: it changes only on commit, and `lagMs` after the commit, like a Dexie round trip. */
function DialHarness({ initial = 25, lagMs = 0, live, commit, handle }: { initial?: number; lagMs?: number; live?: (v: number) => void; commit?: (v: number) => void; handle?: React.Ref<CommitHandle> }) {
  const [stored, setStored] = useState(initial);
  return (
    <Dial
      ref={handle}
      label="Set 1 weight"
      values={WEIGHTS}
      value={stored}
      onChange={(v) => live?.(v)}
      onCommit={(v) => {
        commit?.(v);
        if (lagMs > 0) setTimeout(() => setStored(v), lagMs);
        else setStored(v);
      }}
      valueText={text}
    />
  );
}

const hidePage = () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
};
const showPage = () => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
};

/** Fake timers, but not requestAnimationFrame (the strip's scroll handler is driven by a mocked one). */
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
/** Advance in small steps with a render between them, as a browser would (one big act batches the timers' updates together). */
const tick = (ms: number) => {
  for (let t = 0; t < ms; t += 10) act(() => void vi.advanceTimersByTime(10));
};

afterEach(() => {
  showPage();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Dial with onCommit", () => {
  describe("a drag", () => {
    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200, toJSON: () => ({}) });
    });
    const point = (deg: number) => {
      const a = (deg * Math.PI) / 180;
      return { clientX: 100 + Math.cos(a) * 80, clientY: 100 + Math.sin(a) * 80 };
    };

    it("reports every detent live and commits once, on release", () => {
      const live = vi.fn();
      const commit = vi.fn();
      const { container } = render(<DialHarness live={live} commit={commit} />);
      const face = container.querySelector<HTMLElement>(".dial__face")!;
      fireEvent.pointerDown(face, { pointerId: 1, pointerType: "touch", button: 0, ...point(-90) });
      fireEvent.pointerMove(face, { pointerId: 1, pointerType: "touch", ...point(-75) }); // +1
      fireEvent.pointerMove(face, { pointerId: 1, pointerType: "touch", ...point(-45) }); // +2 (with the carry)
      fireEvent.pointerMove(face, { pointerId: 1, pointerType: "touch", ...point(-15) }); // +2
      const seen = live.mock.calls.map((c) => c[0] as number);
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(seen).toEqual([...seen].sort((a, b) => a - b)); // clockwise only raises it
      expect(commit).not.toHaveBeenCalled();
      // The dial turned although nothing was stored yet.
      expect(range()).not.toHaveValue("2");
      fireEvent.pointerUp(face, { pointerId: 1, pointerType: "touch" });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith(live.mock.calls.at(-1)![0]);
    });

    it("stays where it was released until the stored value comes back (no snap back)", () => {
      fakeTimers();
      const { container } = render(<DialHarness lagMs={40} />);
      const face = container.querySelector<HTMLElement>(".dial__face")!;
      fireEvent.pointerDown(face, { pointerId: 1, pointerType: "touch", button: 0, ...point(-90) });
      fireEvent.pointerMove(face, { pointerId: 1, pointerType: "touch", ...point(-45) });
      const turned = range().value;
      expect(turned).not.toBe("2");
      fireEvent.pointerUp(face, { pointerId: 1, pointerType: "touch" });
      expect(range().value).toBe(turned); // released, write in flight, prop still old
      tick(60);
      expect(range().value).toBe(turned); // the stored value arrived and agrees
    });

    it("a release without a turn commits nothing", () => {
      const commit = vi.fn();
      const { container } = render(<DialHarness commit={commit} />);
      const face = container.querySelector<HTMLElement>(".dial__face")!;
      fireEvent.pointerDown(face, { pointerId: 1, pointerType: "touch", button: 0, ...point(-90) });
      fireEvent.pointerUp(face, { pointerId: 1, pointerType: "touch" });
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("key steps", () => {
    beforeEach(() => vi.useFakeTimers());

    it("are live at once and committed once, 250 ms after the last one", () => {
      const live = vi.fn();
      const commit = vi.fn();
      render(<DialHarness live={live} commit={commit} />);
      range().focus();
      for (let i = 0; i < 3; i++) fireEvent.keyDown(range(), { key: "ArrowRight" });
      expect(live.mock.calls.map((c) => c[0])).toEqual([27.5, 30, 32.5]);
      expect(range()).toHaveAttribute("aria-valuetext", "32.5 kilograms"); // heard at once, not a quarter second later
      tick(200);
      expect(commit).not.toHaveBeenCalled();
      fireEvent.keyDown(range(), { key: "ArrowLeft" }); // restarts the pause
      tick(200);
      expect(commit).not.toHaveBeenCalled();
      tick(60);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith(30);
    });

    it("keep every press when the stored value comes back late", () => {
      const commit = vi.fn();
      render(<DialHarness initial={20} lagMs={80} commit={commit} />);
      range().focus();
      for (const key of ["Home", "PageUp", "PageUp"]) fireEvent.keyDown(range(), { key });
      tick(260);
      expect(commit).toHaveBeenLastCalledWith(40);
      // A press while the first commit's echo is still in flight continues from where the dial is.
      fireEvent.keyDown(range(), { key: "ArrowRight" });
      tick(300);
      expect(commit).toHaveBeenLastCalledWith(42.5);
      expect(range()).toHaveAttribute("aria-valuetext", "42.5 kilograms");
    });

    it("commit when focus leaves", () => {
      const commit = vi.fn();
      render(<DialHarness commit={commit} />);
      range().focus();
      fireEvent.keyDown(range(), { key: "ArrowRight" });
      fireEvent.blur(range());
      expect(commit).toHaveBeenCalledWith(27.5);
      tick(500);
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it("are committed when the page is hidden (app backgrounded), and not twice", () => {
      const commit = vi.fn();
      render(<DialHarness commit={commit} />);
      range().focus();
      fireEvent.keyDown(range(), { key: "ArrowRight" });
      hidePage();
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith(27.5);
      window.dispatchEvent(new Event("pagehide"));
      tick(500);
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it("are committed when the dial unmounts", () => {
      const commit = vi.fn();
      const { unmount } = render(<DialHarness commit={commit} />);
      range().focus();
      fireEvent.keyDown(range(), { key: "ArrowRight" });
      unmount();
      expect(commit).toHaveBeenCalledWith(27.5);
      expect(commit).toHaveBeenCalledTimes(1);
    });

    it("are committed on request through the ref (Log set)", () => {
      const commit = vi.fn();
      const handle = createRef<CommitHandle>();
      render(<DialHarness commit={commit} handle={handle} />);
      range().focus();
      fireEvent.keyDown(range(), { key: "ArrowRight" });
      act(() => handle.current!.flush());
      expect(commit).toHaveBeenCalledWith(27.5);
      act(() => handle.current!.flush()); // nothing pending: no second call
      expect(commit).toHaveBeenCalledTimes(1);
    });
  });
});

const REPS = Array.from({ length: 12 }, (_, i) => i + 1);
const strip = () => screen.getByRole("spinbutton", { name: "Reps" });

function StripHarness({ initial = 5, live, commit, handle, itemSize = 40 }: { initial?: number; live?: (v: number) => void; commit?: (v: number) => void; handle?: React.Ref<CommitHandle>; itemSize?: number }) {
  const [stored, setStored] = useState(initial);
  return (
    <NumberStrip
      ref={handle}
      label="Reps"
      values={REPS}
      value={stored}
      itemSize={itemSize}
      onChange={(v) => live?.(v)}
      onCommit={(v) => {
        commit?.(v);
        setStored(v);
      }}
    />
  );
}

describe("NumberStrip with onCommit", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  it("a tap reports and commits at once", () => {
    const live = vi.fn();
    const commit = vi.fn();
    render(<StripHarness live={live} commit={commit} />);
    fireEvent.click(strip().querySelectorAll(".numstrip__item")[7]!);
    expect(live).toHaveBeenCalledWith(8);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(8);
  });

  it("key steps are live at once and committed once after a pause", () => {
    fakeTimers();
    const live = vi.fn();
    const commit = vi.fn();
    render(<StripHarness live={live} commit={commit} />);
    strip().focus();
    for (let i = 0; i < 3; i++) fireEvent.keyDown(strip(), { key: "ArrowRight" });
    expect(live.mock.calls.map((c) => c[0])).toEqual([6, 7, 8]);
    expect(strip()).toHaveAttribute("aria-valuenow", "8");
    expect(strip().querySelector(".is-sel")).toHaveTextContent("8");
    expect(commit).not.toHaveBeenCalled();
    tick(300);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(8);
  });

  it("a scroll is live while it moves and commits once when it ends (scrollend, or a quiet 150 ms without it)", () => {
    fakeTimers();
    const live = vi.fn();
    const commit = vi.fn();
    render(<StripHarness live={live} commit={commit} />);
    const sc = strip();
    sc.scrollLeft = 6 * 40;
    fireEvent.scroll(sc);
    sc.scrollLeft = 8 * 40;
    fireEvent.scroll(sc);
    expect(live.mock.calls.map((c) => c[0])).toEqual([7, 9]);
    expect(commit).not.toHaveBeenCalled();
    if ("onscrollend" in window) {
      fireEvent(sc, new Event("scrollend"));
      expect(commit).toHaveBeenCalledTimes(1);
    } else {
      tick(200);
      expect(commit).toHaveBeenCalledTimes(1);
    }
    expect(commit).toHaveBeenCalledWith(9);
  });

  it("a scroll that ends with a scrollend event commits at once", () => {
    fakeTimers();
    const commit = vi.fn();
    render(<StripHarness commit={commit} />);
    const sc = strip();
    sc.scrollLeft = 6 * 40;
    fireEvent.scroll(sc);
    fireEvent(sc, new Event("scrollend"));
    expect(commit).toHaveBeenCalledWith(7);
    tick(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("a mouse drag commits once, on release", () => {
    const commit = vi.fn();
    render(<StripHarness commit={commit} />);
    const sc = strip();
    fireEvent.pointerDown(sc, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 300 });
    fireEvent.pointerMove(sc, { pointerId: 1, pointerType: "mouse", clientX: 220 });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.pointerUp(sc, { pointerId: 1, pointerType: "mouse", clientX: 220 });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(7);
  });

  it("a pending value is committed when the page is hidden, on unmount, on blur and through the ref", () => {
    fakeTimers();
    const commit = vi.fn();
    const handle = createRef<CommitHandle>();
    const { unmount } = render(<StripHarness commit={commit} handle={handle} />);
    strip().focus();
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    hidePage();
    expect(commit).toHaveBeenLastCalledWith(6);
    showPage();
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    fireEvent.blur(strip());
    expect(commit).toHaveBeenLastCalledWith(7);
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    act(() => handle.current!.flush());
    expect(commit).toHaveBeenLastCalledWith(8);
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    unmount();
    expect(commit).toHaveBeenLastCalledWith(9);
    expect(commit).toHaveBeenCalledTimes(4);
  });

  it("keeps showing its own value until the stored one comes back, and an outside change still wins afterwards", () => {
    fakeTimers();
    function Lag() {
      const [stored, setStored] = useState(5);
      return (
        <>
          <NumberStrip label="Reps" values={REPS} value={stored} itemSize={40} onChange={() => undefined} onCommit={(v) => setTimeout(() => setStored(v), 100)} />
          <button type="button" onClick={() => setStored(11)}>
            external
          </button>
        </>
      );
    }
    render(<Lag />);
    strip().focus();
    fireEvent.keyDown(strip(), { key: "ArrowRight" });
    tick(300); // committed, write in flight
    expect(strip()).toHaveAttribute("aria-valuenow", "6");
    tick(200); // stored value arrived
    expect(strip()).toHaveAttribute("aria-valuenow", "6");
    fireEvent.click(screen.getByRole("button", { name: "external" }));
    expect(strip()).toHaveAttribute("aria-valuenow", "11");
  });
});
