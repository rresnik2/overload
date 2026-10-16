"use client";
import Link from "next/link";
import { useState } from "react";
import { repo, useLive } from "@/client/repo";
import { EmptyState } from "@/components/primitives/EmptyState";
import { HardCard } from "@/components/primitives/HardCard";
import { Button } from "@/components/ui/Button";
import type { WorkoutRow } from "@/contracts/entities";
import { formatWeight } from "@/lib/units";
import { formatClock } from "./labels";
import { useWorkoutPrefs } from "./prefs";
import { workoutDateLabel } from "./view";

interface Row {
  workout: WorkoutRow;
  exercises: number;
  sets: number;
  volumeKg: number;
}

/** Workouts shown (and summed up) per page: each card reads that workout's sets, so a year of history is not loaded at once. */
export const HISTORY_PAGE = 20;

/** Past workouts grouped by month of `localDate`, newest first, a page at a time. Reads Dexie only. */
export function HistoryList() {
  const prefs = useWorkoutPrefs();
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const page = useLive(async () => {
    const workouts = await repo.workouts.inRange("0000-01-01", "9999-12-31");
    const rows: Row[] = [];
    for (const workout of workouts.slice(0, limit)) {
      const sets = (await repo.sets.forWorkout(workout.id)).filter((s) => s.completedAt != null && s.setType !== "WARMUP");
      rows.push({
        workout,
        exercises: new Set(sets.map((s) => s.exerciseId)).size,
        sets: sets.length,
        volumeKg: sets.reduce((sum, s) => sum + (s.effectiveLoadKg != null && s.reps != null ? s.effectiveLoadKg * s.reps : 0), 0),
      });
    }
    return { rows, total: workouts.length };
  }, [limit]);
  const data = page?.rows;

  if (!data) return <p className="wk-muted" role="status">Loading history…</p>;
  if (data.length === 0) {
    return <EmptyState title="No workouts yet" description="Finished workouts show up here, newest first." action={<Link href="/workout" className="ui-btn ui-btn--primary">Start a workout</Link>} />;
  }

  const months = new Map<string, Row[]>();
  for (const row of data) {
    const key = row.workout.localDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), row]);
  }
  return (
    <>
      {[...months].map(([month, rows]) => (
        <section key={month} aria-label={month}>
          <h2 className="wk-group">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`))}</h2>
          <ul className="wk-list">
            {rows.map(({ workout, exercises, sets, volumeKg }) => (
              <li key={workout.id}>
                <HardCard as="article" className="wk-card">
                  <p className="meta-line">{workoutDateLabel(workout.localDate)}</p>
                  <h3 className="wk-card__title">
                    <Link href={workout.endedAt ? `/history/${workout.id}` : "/workout"}>{workout.title ?? "Workout"}</Link>
                  </h3>
                  <p className="wk-stats num">
                    {workout.endedAt ? (
                      <>
                        <span>{formatClock(new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime())}</span>
                        <span>
                          {exercises} {exercises === 1 ? "exercise" : "exercises"}
                        </span>
                        <span>
                          {sets} {sets === 1 ? "set" : "sets"}
                        </span>
                        <span>{formatWeight(volumeKg, prefs.unit)} volume</span>
                      </>
                    ) : (
                      <span>In progress</span>
                    )}
                  </p>
                </HardCard>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {page.total > data.length ? (
        <Button variant="ink" block onClick={() => setLimit((n) => n + HISTORY_PAGE)}>
          Show earlier workouts ({page.total - data.length} more)
        </Button>
      ) : null}
    </>
  );
}
