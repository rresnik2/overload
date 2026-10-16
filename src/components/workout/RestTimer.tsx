"use client";
import clsx from "clsx";
import { Minus, Pause, Play, Plus, SkipForward, Timer } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InfoHint } from "@/components/ui/InfoHint";
import { Sheet } from "@/components/ui/Sheet";
import { useRestClock, type RestTimerApi } from "./hooks";
import { formatClock } from "./labels";
import type { RestState, RestStatus } from "./rest";

export interface RestTimerViewProps {
  status: RestStatus;
  remainingMs: number;
  durationSec: number;
  onStart: (seconds: number) => void;
  onPause: () => void;
  onResume: () => void;
  onAdjust: (deltaSec: number) => void;
  onClear: () => void;
  /** Preset lengths offered in the sheet. */
  presets?: number[];
}

export interface RestTimerProps extends Pick<RestTimerApi, "start" | "pause" | "resume" | "adjust" | "clear"> {
  /** The persisted timer (`useRestTimer`); this component runs its countdown. */
  state: RestState | null;
  /** The length shown before any rest has started. */
  defaultSec: number;
  presets?: number[];
}

const DEFAULT_PRESETS = [60, 90, 120, 180, 240];

const STATUS_TEXT: Record<RestStatus, string> = { idle: "Rest", running: "Resting", paused: "Rest paused", done: "Rest done" };

/**
 * The rest bar as a leaf: it owns the countdown tick (`useRestClock`), so a tick re-renders this bar and nothing else on the workout
 * screen. Its props are the stable commands of `useRestTimer`, so it also skips renders when the screen re-renders around it.
 */
export const RestTimer = memo(function RestTimer({ state, defaultSec, start, pause, resume, adjust, clear, presets }: RestTimerProps) {
  const { status, remainingMs } = useRestClock(state);
  return <RestTimerView status={status} remainingMs={remainingMs} durationSec={state?.durationSec ?? defaultSec} onStart={start} onPause={pause} onResume={resume} onAdjust={adjust} onClear={clear} presets={presets} />;
});

/** Inline rest bar pinned above the thumb; tap the clock for the sheet (presets, +/-15 s). Counts down to an absolute end time (see rest.ts). */
export function RestTimerView({ status, remainingMs, durationSec, onStart, onPause, onResume, onAdjust, onClear, presets = DEFAULT_PRESETS }: RestTimerViewProps) {
  const [open, setOpen] = useState(false);
  const clock = formatClock(status === "done" ? 0 : remainingMs);
  return (
    <>
      <div className={clsx("wk-rest", `wk-rest--${status}`)} role="region" aria-label="Rest timer" data-status={status}>
        <button type="button" className="wk-rest__main" onClick={() => setOpen(true)} aria-label={`${STATUS_TEXT[status]} ${status === "idle" ? "timer" : clock}. Open rest timer`}>
          <Timer size={20} aria-hidden="true" />
          <span className="wk-rest__label">{STATUS_TEXT[status]}</span>
          {status !== "idle" ? (
            <span className="wk-rest__clock num" data-testid="rest-clock">
              {clock}
            </span>
          ) : null}
        </button>
        <InfoHint term="restTimer" />
        {status === "running" || status === "paused" ? (
          <>
            <button type="button" className="wk-icon-btn" aria-label="Subtract 15 seconds" onClick={() => onAdjust(-15)}>
              <Minus size={18} aria-hidden="true" />
            </button>
            <button type="button" className="wk-icon-btn" aria-label="Add 15 seconds" onClick={() => onAdjust(15)}>
              <Plus size={18} aria-hidden="true" />
            </button>
            <button type="button" className="wk-icon-btn" aria-label={status === "running" ? "Pause rest" : "Resume rest"} onClick={status === "running" ? onPause : onResume}>
              {status === "running" ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            </button>
          </>
        ) : null}
        {status !== "idle" ? (
          <button type="button" className="wk-icon-btn" aria-label={status === "done" ? "Dismiss rest timer" : "Skip rest"} onClick={onClear}>
            <SkipForward size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Rest timer" description={status === "idle" ? "Start a rest." : `Started at ${formatClock(durationSec * 1000)}.`}>
        <div className="wk-rest-sheet">
          <p className="wk-rest-sheet__clock num" aria-live="off">
            {clock}
          </p>
          <p className="wk-rest-sheet__status">{STATUS_TEXT[status]}</p>
          <p className="wk-muted">Rests start by themselves when you finish a set. Heavy lifts usually need 2 to 5 minutes.</p>
          {status === "running" || status === "paused" ? (
            <div className="wk-rest-sheet__row">
              <Button variant="ink" onClick={() => onAdjust(-15)}>
                -15 s
              </Button>
              <Button variant="ink" onClick={status === "running" ? onPause : onResume}>
                {status === "running" ? "Pause" : "Resume"}
              </Button>
              <Button variant="ink" onClick={() => onAdjust(15)}>
                +15 s
              </Button>
            </div>
          ) : null}
          <div className="wk-rest-sheet__presets" role="group" aria-label="Start a rest of">
            {presets.map((sec) => (
              <Button key={sec} variant="ghost" onClick={() => onStart(sec)}>
                {formatClock(sec * 1000)}
              </Button>
            ))}
          </div>
          {status !== "idle" ? (
            <Button
              variant="danger"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              {status === "done" ? "Dismiss" : "Skip rest"}
            </Button>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
