"use client";
// Small browser hooks for the logging screens: a ticking clock, the rest timer, the Screen Wake Lock.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adjustRest, loadRest, pauseRest, restRemainingMs, restStatus, resumeRest, saveRest, startRest, type RestState, type RestStatus } from "./rest";

/** Epoch ms that re-renders every `intervalMs` while `enabled`, and immediately when the tab becomes visible again. */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tick);
      window.removeEventListener("focus", tick);
    };
  }, [intervalMs, enabled]);
  return now;
}

let audio: AudioContext | null = null;

/** Create/resume the AudioContext from a user gesture (iOS only allows it then), so the ding can play later. */
export function primeAudio(): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio */
  }
}

/** Haptic + ding where supported (both feature-detected; failures are silent). */
export function restDoneCue(): void {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* no vibration */
  }
  try {
    if (!audio || audio.state !== "running") return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.5);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.55);
  } catch {
    /* no audio */
  }
}

export interface RestTimerApi {
  state: RestState | null;
  start: (seconds: number) => void;
  pause: () => void;
  resume: () => void;
  adjust: (deltaSec: number) => void;
  clear: () => void;
}

/**
 * The persisted rest timer of a workout: absolute `endsAt` in localStorage. This hook holds the state and the commands and does
 * NOT tick (a ticking hook here would re-render the whole workout screen four times a second); `useRestClock` does, inside the
 * rest bar. `state` changes only on a command, and the commands keep their identity for the life of the screen.
 */
export function useRestTimer(workoutId: string | null): RestTimerApi {
  // Read once on mount (the caller keys the screen by workout id); SSR never renders this because Dexie data gates the screen.
  const [state, setState] = useState<RestState | null>(() => (workoutId ? loadRest(workoutId) : null));
  // The commands read the latest state through a ref so they can stay referentially stable.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  const commit = useCallback((next: RestState | null) => {
    latest.current = next;
    setState(next);
    saveRest(next);
  }, []);

  const start = useCallback(
    (seconds: number) => {
      if (!workoutId) return;
      primeAudio();
      commit(startRest(workoutId, Date.now(), seconds));
    },
    [workoutId, commit],
  );
  const pause = useCallback(() => {
    if (latest.current) commit(pauseRest(latest.current, Date.now()));
  }, [commit]);
  const resume = useCallback(() => {
    if (latest.current) commit(resumeRest(latest.current, Date.now()));
  }, [commit]);
  const adjust = useCallback(
    (deltaSec: number) => {
      if (latest.current) commit(adjustRest(latest.current, Date.now(), deltaSec));
    },
    [commit],
  );
  const clear = useCallback(() => commit(null), [commit]);

  return useMemo(() => ({ state, start, pause, resume, adjust, clear }), [state, start, pause, resume, adjust, clear]);
}

export interface RestClock {
  status: RestStatus;
  remainingMs: number;
}

/** The countdown of a rest timer: ticks every 250 ms while it runs (and when the tab returns), and rings once when it ends. Call it from the rest bar only. */
export function useRestClock(state: RestState | null): RestClock {
  const running = state !== null && state.endsAt !== null;
  const now = useNow(250, running);
  const notified = useRef<number | null>(null);
  const status = restStatus(state, now);
  const remainingMs = restRemainingMs(state, now);

  // Ding once per rest, only when we actually watched it end (not when a reload finds an old finished timer).
  useEffect(() => {
    if (status !== "done" || !state || state.endsAt === null || notified.current === state.endsAt) return;
    const stale = Date.now() - state.endsAt > 5000;
    notified.current = state.endsAt;
    if (!stale) restDoneCue();
  }, [status, state]);

  return { status, remainingMs };
}

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

/** Keeps the screen on while `active` (Screen Wake Lock API; feature-detected, re-acquired after the tab returns). */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as unknown as { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        sentinel = await wakeLock.request("screen");
        if (cancelled) void sentinel.release().catch(() => undefined);
      } catch {
        /* denied (low battery, no gesture yet): the screen just sleeps normally */
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
