import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_WORKOUT_STORAGE_KEY, isWorkoutActive, onWorkoutActiveChange, setWorkoutActive } from "./pwa";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("active workout flag", () => {
  it("is set and cleared", () => {
    expect(isWorkoutActive()).toBe(false);
    setWorkoutActive(true);
    expect(isWorkoutActive()).toBe(true);
    setWorkoutActive(false);
    expect(isWorkoutActive()).toBe(false);
  });

  it("announces flips (not timestamp refreshes) in this tab, and flips made in another tab", () => {
    const seen: boolean[] = [];
    const off = onWorkoutActiveChange((active) => seen.push(active));
    setWorkoutActive(false); // already off: nothing
    setWorkoutActive(true);
    setWorkoutActive(true); // refresh of the 10-minute heartbeat: not a change
    setWorkoutActive(false);
    expect(seen).toEqual([true, false]);

    localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, String(Date.now())); // what another tab does
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_WORKOUT_STORAGE_KEY }));
    localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: ACTIVE_WORKOUT_STORAGE_KEY }));
    expect(seen).toEqual([true, false, true, false]);
    off();
    setWorkoutActive(true);
    expect(seen).toHaveLength(4);
  });

  it("treats an old flag as stale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T10:00:00Z"));
    setWorkoutActive(true);
    vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
    expect(isWorkoutActive()).toBe(false);
    localStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, "garbage");
    expect(isWorkoutActive()).toBe(false);
  });
});
