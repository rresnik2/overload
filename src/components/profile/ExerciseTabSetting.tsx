"use client";
import { setExerciseTabSide, useExerciseTabSide, type ExerciseTabSide } from "@/components/workout/exerciseTabSide";

const OPTIONS: { value: ExerciseTabSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

/** Settings > Profile: which screen edge the exercise tab sits on during a workout. Per device, like "Show tips". */
export function ExerciseTabSetting() {
  const side = useExerciseTabSide();
  return (
    <fieldset className="grid gap-2">
      <legend className="font-semibold">Exercise tab</legend>
      <div className="join">
        {OPTIONS.map((o) => (
          <input
            key={o.value}
            type="radio"
            name="exercise-tab-side"
            className="btn join-item min-h-[var(--tap-target)]"
            aria-label={o.label}
            value={o.value}
            checked={side === o.value}
            onChange={() => setExerciseTabSide(o.value)}
          />
        ))}
      </div>
      <p className="m-0 text-sm text-[var(--color-muted)]">Which screen edge the exercise tab sits on during a workout. Saved on this device only.</p>
    </fieldset>
  );
}
