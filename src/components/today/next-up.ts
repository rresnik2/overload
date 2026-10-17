// Pure helpers for the "Next up" card on /today: which template (or, without templates, which past session) comes next, the plan
// line of one exercise and the top set to draw.
import type { TemplateExerciseRow, TemplateRow, WorkoutRow, WorkoutSetRow } from "@/contracts/entities";

const byPosition = (a: Pick<TemplateRow, "position">, b: Pick<TemplateRow, "position">) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0);

/**
 * The template to do next: the one after the most recently started template in the user's own order (wrapping round), so a
 * push / pull / legs rotation advances by itself. Without any workout from a template, the first template. null without templates.
 */
export function nextTemplate<T extends Pick<TemplateRow, "id" | "position">>(templates: T[], workouts: Pick<WorkoutRow, "templateId" | "startedAt">[]): T | null {
  if (templates.length === 0) return null;
  const ordered = [...templates].sort(byPosition);
  const ids = new Set(ordered.map((t) => t.id));
  let lastId: string | null = null;
  let lastStart = "";
  for (const w of workouts) {
    if (w.templateId && ids.has(w.templateId) && w.startedAt > lastStart) {
      lastId = w.templateId;
      lastStart = w.startedAt;
    }
  }
  if (lastId === null) return ordered[0]!;
  const i = ordered.findIndex((t) => t.id === lastId);
  return ordered[(i + 1) % ordered.length]!;
}

/** "4 × 5", "3 × 8–10" or "3 sets" (no rep target). The en dash is the range mark. */
export function planLine(ex: Pick<TemplateExerciseRow, "workingSets" | "repMin" | "repMax">): string {
  const { workingSets: sets, repMin, repMax } = ex;
  if (repMin == null && repMax == null) return `${sets} ${sets === 1 ? "set" : "sets"}`;
  const lo = repMin ?? repMax!;
  const hi = repMax ?? repMin!;
  return `${sets} × ${lo === hi ? lo : `${lo}–${hi}`}`;
}

/** A title that names a session ("Upper A"), not the default "Workout" or nothing. */
const sessionName = (title: string | null): string | null => {
  const t = title?.trim() ?? "";
  return t === "" || t.toLowerCase() === "workout" ? null : t;
};

/**
 * Without templates: the past session to repeat. Of the names used in the last `window` finished workouts, the one done least
 * recently, so an A/B or upper/lower rotation advances by itself; with one name, that one. Returns that name's latest workout,
 * or null when no finished workout has a name.
 */
export function nextFromHistory<W extends Pick<WorkoutRow, "title" | "startedAt" | "endedAt">>(workouts: W[], window = 12): W | null {
  const recent = workouts
    .filter((w) => w.endedAt !== null && sessionName(w.title) !== null)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0))
    .slice(0, window);
  const latestByName = new Map<string, W>();
  for (const w of recent) {
    const name = sessionName(w.title)!.toLowerCase();
    if (!latestByName.has(name)) latestByName.set(name, w);
  }
  let pick: W | null = null;
  for (const w of latestByName.values()) if (pick === null || w.startedAt < pick.startedAt) pick = w;
  return pick;
}

/** The plan line of one exercise as it was done: completed working sets and their rep range ("4 × 5–6"). */
export function donePlanLine(sets: Pick<WorkoutSetRow, "setType" | "completedAt" | "reps">[]): string | null {
  const work = sets.filter((s) => s.completedAt !== null && s.setType !== "WARMUP");
  if (work.length === 0) return null;
  const reps = work.flatMap((s) => (s.reps != null && s.reps > 0 ? [s.reps] : []));
  return planLine({ workingSets: work.length, repMin: reps.length ? Math.min(...reps) : null, repMax: reps.length ? Math.max(...reps) : null });
}

/** The heaviest completed working set (most reps on a tie), or null. */
export function topSet<S extends Pick<WorkoutSetRow, "setType" | "completedAt" | "weightKg" | "reps">>(sets: S[]): S | null {
  let best: S | null = null;
  for (const s of sets) {
    if (s.completedAt === null || s.setType === "WARMUP") continue;
    const w = s.weightKg ?? 0;
    const bw = best?.weightKg ?? 0;
    if (best === null || w > bw || (w === bw && (s.reps ?? 0) > (best.reps ?? 0))) best = s;
  }
  return best;
}
