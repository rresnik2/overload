import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatClock } from "./labels";
import { adjustRest, loadRest, parseRest, pauseRest, REST_MAX_SEC, REST_STORAGE_KEY, restRemainingMs, restStatus, resumeRest, saveRest, startRest } from "./rest";

describe("rest timer maths (absolute restEndsAt)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("counts down against the wall clock, not against ticks", () => {
    vi.setSystemTime(new Date("2026-10-14T18:00:00.000Z"));
    const rest = startRest("w1", Date.now(), 90);
    expect(rest.endsAt).toBe(Date.parse("2026-10-14T18:01:30.000Z"));
    expect(restStatus(rest, Date.now())).toBe("running");
    expect(restRemainingMs(rest, Date.now())).toBe(90_000);
    // A backgrounded iOS tab runs no timers: jump the clock 40 s with NO tick in between.
    vi.setSystemTime(new Date("2026-10-14T18:00:40.000Z"));
    expect(restRemainingMs(rest, Date.now())).toBe(50_000);
    expect(formatClock(restRemainingMs(rest, Date.now()))).toBe("0:50");
    vi.setSystemTime(new Date("2026-10-14T18:01:31.000Z"));
    expect(restStatus(rest, Date.now())).toBe("done");
    expect(restRemainingMs(rest, Date.now())).toBe(0);
  });

  it("pauses to the remaining time and resumes to a new absolute end", () => {
    const rest = startRest("w1", 1_000_000, 60);
    const paused = pauseRest(rest, 1_020_000);
    expect(paused).toMatchObject({ endsAt: null, pausedRemainingMs: 40_000 });
    expect(restStatus(paused, 9_999_999)).toBe("paused");
    expect(restRemainingMs(paused, 9_999_999)).toBe(40_000);
    const resumed = resumeRest(paused, 2_000_000);
    expect(resumed).toMatchObject({ endsAt: 2_040_000, pausedRemainingMs: null });
    expect(pauseRest(paused, 5)).toBe(paused);
    expect(resumeRest(resumed, 5)).toBe(resumed);
  });

  it("adjusts a running or paused timer, never below zero or above the cap", () => {
    const rest = startRest("w1", 0, 60);
    expect(restRemainingMs(adjustRest(rest, 10_000, 15), 10_000)).toBe(65_000);
    expect(restRemainingMs(adjustRest(rest, 10_000, -15), 10_000)).toBe(35_000);
    expect(restStatus(adjustRest(rest, 10_000, -600), 10_000)).toBe("done");
    expect(restRemainingMs(adjustRest(rest, 0, 99_999), 0)).toBe(REST_MAX_SEC * 1000);
    const paused = pauseRest(rest, 30_000);
    expect(adjustRest(paused, 30_000, 30)).toMatchObject({ endsAt: null, pausedRemainingMs: 60_000 });
  });

  it("clamps the start length and treats no state as idle", () => {
    expect(startRest("w", 0, 0).durationSec).toBe(1);
    expect(startRest("w", 0, 99_999).durationSec).toBe(REST_MAX_SEC);
    expect(restStatus(null, 0)).toBe("idle");
    expect(restRemainingMs(null, 0)).toBe(0);
  });
});

describe("rest timer persistence (survives a reload)", () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
  };

  it("round-trips running and paused timers and only for the same workout", () => {
    const storage = memory();
    const running = startRest("w1", 5_000, 90);
    saveRest(running, storage);
    expect(loadRest("w1", storage)).toEqual(running);
    expect(loadRest("other", storage)).toBeNull();
    const paused = pauseRest(running, 6_000);
    saveRest(paused, storage);
    expect(loadRest("w1", storage)).toEqual(paused);
    saveRest(null, storage);
    expect(storage.data.has(REST_STORAGE_KEY)).toBe(false);
    expect(loadRest("w1", storage)).toBeNull();
  });

  it("ignores garbage", () => {
    expect(parseRest("{not json", "w1")).toBeNull();
    expect(parseRest(JSON.stringify({ workoutId: "w1", durationSec: 60 }), "w1")).toBeNull();
    expect(parseRest(null, "w1")).toBeNull();
  });
});
