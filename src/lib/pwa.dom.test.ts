import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_WORKOUT_STORAGE_KEY, isWorkoutActive, setWorkoutActive } from "./pwa";

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
