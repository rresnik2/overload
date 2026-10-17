"use client";
// Shared by Dial and NumberStrip: a value is shown live while the lifter turns the control, but handed on (`onCommit`) once.
import { useEffect, useRef } from "react";

/** A key, wheel or arrow step is committed after this long without another one. */
export const STEP_COMMIT_MS = 250;
/** A committed value that the `value` prop never echoes (a failed write) stops being shown after this long. */
export const ECHO_MS = 1500;

/** What a parent can ask of a control that has a value waiting to be committed. */
export interface CommitHandle {
  /** Commit the pending value now (no-op when none is pending). Call it before reading the stored value, e.g. on "Log set". */
  flush(): void;
}

/**
 * Runs `flush` when the page is hidden (tab switch, app backgrounded, lock screen), on `pagehide`, and when the component unmounts,
 * so a value that is still waiting for its commit is never lost with the page.
 */
export function useFlushOnLeave(flush: () => void): void {
  const ref = useRef(flush);
  useEffect(() => {
    ref.current = flush;
  });
  useEffect(() => {
    const run = () => ref.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", run);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", run);
      run();
    };
  }, []);
}
