"use client";
// The user's logging preferences (unit, effort scale, default rest). The workout layout reads the profile on the server
// and the page HTML is cached by the service worker, so the values are available offline; they are also mirrored to
// localStorage as a fallback for a profile-less first paint.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import type { E1rmFormula, EffortScale, WeightUnit } from "@/contracts/enums";

export interface WorkoutPrefs {
  unit: WeightUnit;
  effortScale: EffortScale;
  defaultRestSec: number;
  e1rmFormula: E1rmFormula;
}

export const DEFAULT_PREFS: WorkoutPrefs = { unit: "KG", effortScale: "RIR", defaultRestSec: 90, e1rmFormula: "EPLEY" };

const STORAGE_KEY = "overload-workout-prefs";

function readStored(): WorkoutPrefs | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<WorkoutPrefs>) } : null;
  } catch {
    return null;
  }
}

const PrefsContext = createContext<WorkoutPrefs>(DEFAULT_PREFS);

export function PrefsProvider({ prefs, children }: { prefs: WorkoutPrefs | null; children: ReactNode }) {
  useEffect(() => {
    if (!prefs) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage unavailable */
    }
  }, [prefs]);
  // The server value wins; a missing profile falls back to what this device last saw.
  const value = useMemo(() => prefs ?? (typeof window === "undefined" ? null : readStored()) ?? DEFAULT_PREFS, [prefs]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function useWorkoutPrefs(): WorkoutPrefs {
  return useContext(PrefsContext);
}
