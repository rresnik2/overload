import { fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwipe } from "./useSwipe";
import type { UseSwipeOptions } from "./useSwipe";

function Zone({ children, ...options }: UseSwipeOptions & { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useSwipe(ref, options);
  return (
    <div ref={ref} data-testid="zone">
      <p data-testid="plain">plain</p>
      {children}
    </div>
  );
}

let clock = 0;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});
afterEach(() => vi.restoreAllMocks());

interface Step {
  dx: number;
  dy?: number;
  ms?: number;
}

/** A pointer gesture from (100, 200): down, one move per step (cumulative offsets), then up at the last position. */
function gesture(el: Element, steps: Step[], pointerType = "touch") {
  const base = { pointerId: 1, pointerType, isPrimary: true };
  fireEvent.pointerDown(el, { ...base, clientX: 100, clientY: 200 });
  let last = { x: 100, y: 200 };
  for (const s of steps) {
    clock += s.ms ?? 16;
    last = { x: 100 + s.dx, y: 200 + (s.dy ?? 0) };
    fireEvent.pointerMove(el, { ...base, clientX: last.x, clientY: last.y });
  }
  fireEvent.pointerUp(el, { ...base, clientX: last.x, clientY: last.y });
}

describe("useSwipe thresholds", () => {
  it("commits a long horizontal drag and reports its direction", () => {
    const onSwipe = vi.fn();
    const onEnd = vi.fn();
    render(<Zone onSwipe={onSwipe} onEnd={onEnd} />);
    gesture(screen.getByTestId("plain"), [{ dx: -30, ms: 100 }, { dx: -80, ms: 200 }]);
    expect(onSwipe).toHaveBeenCalledWith("left");
    expect(onEnd).toHaveBeenCalledWith("left");
    onSwipe.mockClear();
    gesture(screen.getByTestId("plain"), [{ dx: 40, ms: 200 }, { dx: 70, ms: 200 }]);
    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  it("rejects a short, slow drag but still ends the gesture", () => {
    const onSwipe = vi.fn();
    const onEnd = vi.fn();
    render(<Zone onSwipe={onSwipe} onEnd={onEnd} />);
    gesture(screen.getByTestId("plain"), [{ dx: 30, ms: 400 }, { dx: 50, ms: 400 }]);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(null);
  });

  it("commits a short fling", () => {
    const onSwipe = vi.fn();
    render(<Zone onSwipe={onSwipe} />);
    gesture(screen.getByTestId("plain"), [{ dx: -20, ms: 20 }, { dx: -45, ms: 20 }]);
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("reports moves only once the intent is horizontal", () => {
    const onMove = vi.fn();
    render(<Zone onMove={onMove} />);
    const el = screen.getByTestId("plain");
    const base = { pointerId: 1, pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(el, { ...base, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(el, { ...base, clientX: 104, clientY: 200 });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.pointerMove(el, { ...base, clientX: 130, clientY: 203 });
    expect(onMove).toHaveBeenLastCalledWith(30);
    fireEvent.pointerUp(el, { ...base, clientX: 130, clientY: 203 });
  });

  it("cancels on vertical intent for good, even if the finger later swings sideways", () => {
    const onSwipe = vi.fn();
    const onMove = vi.fn();
    render(<Zone onSwipe={onSwipe} onMove={onMove} />);
    gesture(screen.getByTestId("plain"), [{ dy: 40, dx: 5 }, { dy: 42, dx: 120 }]);
    expect(onMove).not.toHaveBeenCalled();
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("never calls preventDefault: vertical scrolls and taps stay the browser's", () => {
    render(<Zone onSwipe={() => undefined} />);
    const el = screen.getByTestId("plain");
    const base = { pointerId: 1, pointerType: "touch", isPrimary: true, cancelable: true };
    const results = [
      fireEvent.pointerDown(el, { ...base, clientX: 100, clientY: 200 }),
      fireEvent.pointerMove(el, { ...base, clientX: 100, clientY: 260 }),
      fireEvent.pointerUp(el, { ...base, clientX: 100, clientY: 260 }),
    ];
    expect(results).toEqual([true, true, true]); // dispatchEvent returns false when preventDefault was called
  });

  it("a pointercancel ends the gesture without a swipe", () => {
    const onSwipe = vi.fn();
    const onEnd = vi.fn();
    render(<Zone onSwipe={onSwipe} onEnd={onEnd} />);
    const el = screen.getByTestId("plain");
    const base = { pointerId: 1, pointerType: "touch", isPrimary: true };
    fireEvent.pointerDown(el, { ...base, clientX: 100, clientY: 200 });
    fireEvent.pointerMove(el, { ...base, clientX: 40, clientY: 200 });
    fireEvent.pointerCancel(el, base);
    fireEvent.pointerUp(el, { ...base, clientX: 40, clientY: 200 });
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith(null);
  });

  it("honours the allowed directions", () => {
    const onSwipe = vi.fn();
    const onEnd = vi.fn();
    render(<Zone directions={["right"]} onSwipe={onSwipe} onEnd={onEnd} />);
    gesture(screen.getByTestId("plain"), [{ dx: -90, ms: 100 }]);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled(); // cancelled before it ever became a gesture
    gesture(screen.getByTestId("plain"), [{ dx: 90, ms: 100 }]);
    expect(onSwipe).toHaveBeenCalledWith("right");
  });

  it("does nothing when disabled", () => {
    const onSwipe = vi.fn();
    render(<Zone enabled={false} onSwipe={onSwipe} />);
    gesture(screen.getByTestId("plain"), [{ dx: -120, ms: 100 }]);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});

describe("useSwipe pointer types and start zones", () => {
  it("ignores a mouse, accepts touch and pen", () => {
    const onSwipe = vi.fn();
    render(<Zone onSwipe={onSwipe} />);
    gesture(screen.getByTestId("plain"), [{ dx: -120, ms: 100 }], "mouse");
    expect(onSwipe).not.toHaveBeenCalled();
    gesture(screen.getByTestId("plain"), [{ dx: -120, ms: 100 }], "pen");
    expect(onSwipe).toHaveBeenCalledTimes(1);
  });

  it("ignores a second finger", () => {
    const onSwipe = vi.fn();
    render(<Zone onSwipe={onSwipe} />);
    const el = screen.getByTestId("plain");
    fireEvent.pointerDown(el, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 100, clientY: 200 });
    fireEvent.pointerDown(el, { pointerId: 2, pointerType: "touch", isPrimary: false, clientX: 160, clientY: 200 });
    fireEvent.pointerMove(el, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 10, clientY: 200 });
    fireEvent.pointerUp(el, { pointerId: 1, pointerType: "touch", isPrimary: true, clientX: 10, clientY: 200 });
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores gestures that start inside [data-no-swipe], at any depth", () => {
    const onSwipe = vi.fn();
    render(
      <Zone onSwipe={onSwipe}>
        <div data-no-swipe>
          <span data-testid="deep">dial</span>
        </div>
      </Zone>,
    );
    gesture(screen.getByTestId("deep"), [{ dx: -120, ms: 100 }]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores gestures that start in a form field", () => {
    const onSwipe = vi.fn();
    render(
      <Zone onSwipe={onSwipe}>
        <input aria-label="name" />
      </Zone>,
    );
    gesture(screen.getByLabelText("name"), [{ dx: -120, ms: 100 }]);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores gestures inside an element that really scrolls sideways, and swipes elsewhere", () => {
    const onSwipe = vi.fn();
    render(
      <Zone onSwipe={onSwipe}>
        <div data-testid="scroller" style={{ overflowX: "auto" }}>
          <span data-testid="in-scroller">wide</span>
        </div>
        <div data-testid="clipped" style={{ overflowX: "auto" }}>
          <span data-testid="in-clipped">fits</span>
        </div>
      </Zone>,
    );
    // jsdom has no layout: say that this one overflows and the other does not.
    Object.defineProperty(screen.getByTestId("scroller"), "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(screen.getByTestId("scroller"), "clientWidth", { value: 300, configurable: true });
    gesture(screen.getByTestId("in-scroller"), [{ dx: -120, ms: 100 }]);
    expect(onSwipe).not.toHaveBeenCalled();
    gesture(screen.getByTestId("in-clipped"), [{ dx: -120, ms: 100 }]);
    expect(onSwipe).toHaveBeenCalledWith("left");
  });

  it("honours a start filter (the edge zone)", () => {
    const onSwipe = vi.fn();
    render(<Zone onSwipe={onSwipe} startFilter={(e) => e.clientX <= 20} />);
    gesture(screen.getByTestId("plain"), [{ dx: 120, ms: 100 }]); // starts at x = 100
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("does not let the click after a swipe through", () => {
    const onClick = vi.fn();
    const onSwipe = vi.fn();
    render(
      <Zone onSwipe={onSwipe}>
        <button onClick={onClick}>go</button>
      </Zone>,
    );
    const button = screen.getByRole("button", { name: "go" });
    gesture(button, [{ dx: -120, ms: 100 }]);
    fireEvent.click(button);
    expect(onSwipe).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("leaves a plain tap alone", () => {
    const onClick = vi.fn();
    const onSwipe = vi.fn();
    render(
      <Zone onSwipe={onSwipe}>
        <button onClick={onClick}>go</button>
      </Zone>,
    );
    const button = screen.getByRole("button", { name: "go" });
    gesture(button, [{ dx: 2 }]);
    fireEvent.click(button);
    expect(onSwipe).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
