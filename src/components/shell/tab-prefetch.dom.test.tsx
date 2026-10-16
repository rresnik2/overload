import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkoutActive } from "@/lib/pwa";
import { mayPrefetchTabs, neighbourTabs, useTabPrefetch } from "./useTabPrefetch";

function Probe({ enabled = true, pathname }: { enabled?: boolean; pathname: string }) {
  useTabPrefetch(enabled, pathname, prefetch);
  return null;
}
const prefetch = vi.fn();

beforeEach(() => {
  prefetch.mockReset();
  // Run idle callbacks on a timer so the tests control when the page is "idle".
  vi.useFakeTimers();
  vi.stubGlobal("requestIdleCallback", (cb: () => void) => window.setTimeout(cb, 100));
  vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  Reflect.deleteProperty(navigator, "connection");
});

describe("neighbourTabs", () => {
  it("lists the tabs next to the current one, next first, and nothing off the ring", () => {
    expect(neighbourTabs("/today")).toEqual(["/exercises"]);
    expect(neighbourTabs("/exercises")).toEqual(["/progress", "/today"]);
    expect(neighbourTabs("/progress")).toEqual(["/exercises"]);
    expect(neighbourTabs("/history")).toEqual([]);
    expect(neighbourTabs("/progress/abc")).toEqual([]);
  });
});

describe("mayPrefetchTabs", () => {
  it("respects data saver, slow networks and an active workout", () => {
    expect(mayPrefetchTabs(undefined, false)).toBe(true);
    expect(mayPrefetchTabs({ effectiveType: "4g" }, false)).toBe(true);
    expect(mayPrefetchTabs({ saveData: true }, false)).toBe(false);
    expect(mayPrefetchTabs({ effectiveType: "2g" }, false)).toBe(false);
    expect(mayPrefetchTabs({ effectiveType: "slow-2g" }, false)).toBe(false);
    expect(mayPrefetchTabs({ effectiveType: "4g" }, true)).toBe(false);
  });
});

describe("useTabPrefetch", () => {
  it("prefetches both neighbours once the page is idle, not before", () => {
    render(<Probe pathname="/exercises" />);
    expect(prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(prefetch.mock.calls.map(([h]) => h)).toEqual(["/progress", "/today"]);
  });

  it("does nothing off phones, off the ring, with data saver on, or during a workout", () => {
    render(<Probe enabled={false} pathname="/today" />);
    render(<Probe pathname="/settings/profile" />);
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    render(<Probe pathname="/today" />);
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();

    Reflect.deleteProperty(navigator, "connection");
    setWorkoutActive(true);
    render(<Probe pathname="/today" />);
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("is cancelled when the page changes before it was idle", () => {
    const { unmount } = render(<Probe pathname="/today" />);
    unmount();
    vi.advanceTimersByTime(500);
    expect(prefetch).not.toHaveBeenCalled();
  });
});
