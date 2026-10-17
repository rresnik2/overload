import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setWorkoutActive } from "@/lib/pwa";
import { mayPrefetchTabs, neighbourTabs, useTabPrefetchReady } from "./useTabPrefetch";

beforeEach(() => {
  // Idle callbacks run on a timer, so the tests decide when the page is "idle".
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

describe("useTabPrefetchReady", () => {
  it("is false at first and turns true once the page is idle", () => {
    const { result } = renderHook(() => useTabPrefetchReady(true, "/exercises"));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBe(true);
  });

  it("starts over on a route change", () => {
    const { result, rerender } = renderHook(({ path }) => useTabPrefetchReady(true, path), { initialProps: { path: "/today" } });
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBe(true);
    rerender({ path: "/exercises" });
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBe(true);
  });

  it("stays false when disabled, off the ring, with data saver on, or during a workout", () => {
    const off = renderHook(() => useTabPrefetchReady(false, "/today"));
    const away = renderHook(() => useTabPrefetchReady(true, "/settings/profile"));
    Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
    const saver = renderHook(() => useTabPrefetchReady(true, "/today"));
    act(() => void vi.advanceTimersByTime(500));
    expect([off.result.current, away.result.current, saver.result.current]).toEqual([false, false, false]);

    Reflect.deleteProperty(navigator, "connection");
    setWorkoutActive(true);
    const logging = renderHook(() => useTabPrefetchReady(true, "/today"));
    act(() => void vi.advanceTimersByTime(500));
    expect(logging.result.current).toBe(false);
  });

  it("does not turn on after the page was left before it was idle", () => {
    const { result, unmount } = renderHook(() => useTabPrefetchReady(true, "/today"));
    unmount();
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current).toBe(false);
  });
});
