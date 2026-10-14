// Per-series session points. STUB (stream D implements).
import type { SessionBestE1rm } from "@/contracts/analytics";

/** Best e1RM per session for one series, from non-warm-up, non-drop sets of <= 10 reps. Oldest first. */
export const sessionBestE1rm: SessionBestE1rm = () => {
  throw new Error("not implemented: sessionBestE1rm");
};
