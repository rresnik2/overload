// Per-series session points: the best e1RM of each session.
import type { SessionBestE1rm, SessionPoint, SetFact } from "@/contracts/analytics";
import { estimate1RM } from "./e1rm";
import { SESSION_E1RM_MAX_REPS } from "./constants";

/** The e1RM of one set: recomputed with `formula` when asked for one, else the stored value (else Epley from the load). */
export function setE1rm(set: SetFact, formula?: "EPLEY" | "BRZYCKI"): number | null {
  if (formula === undefined && set.e1rmKg != null) return set.e1rmKg;
  const load = set.effectiveLoadKg;
  if (load == null || set.reps == null) return null;
  return estimate1RM({ weightKg: load, reps: set.reps, rir: set.rir, formula })?.e1rmKg ?? null;
}

/** Best e1RM per session for one series, from non-warm-up, non-drop sets of <= 10 reps. Oldest first. */
export const sessionBestE1rm: SessionBestE1rm = (sets, opts) => {
  // Grouped by (date, seriesKey) so even a mixed input can never merge two series.
  const best = new Map<string, SessionPoint>();
  for (const set of sets) {
    if (set.setType === "WARMUP" || set.setType === "DROP") continue;
    if (set.reps == null || set.reps < 1 || set.reps > SESSION_E1RM_MAX_REPS) continue;
    const e1rm = setE1rm(set, opts?.formula);
    if (e1rm == null) continue;
    const key = `${set.localDate}|${set.seriesKey}`;
    const cur = best.get(key);
    if (!cur || e1rm > cur.e1rmKg) {
      best.set(key, { localDate: set.localDate, e1rmKg: e1rm, seriesKey: set.seriesKey, isDeload: set.isDeload });
    }
  }
  return [...best.values()].sort(
    (a, b) => a.localDate.localeCompare(b.localDate) || a.seriesKey.localeCompare(b.seriesKey),
  );
};
