// Pure helpers for the "Next up" card on /today: which template comes next, and the plan line of one exercise.
import type { TemplateExerciseRow, TemplateRow, WorkoutRow } from "@/contracts/entities";

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
