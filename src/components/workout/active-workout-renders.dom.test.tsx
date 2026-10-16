// The active workout screen against a real (fake-indexeddb) repo: what re-renders, and what is re-read, when a clock ticks or a set is written.
import "fake-indexeddb/auto";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { ToastProvider } from "@/components/ui/Toast";
import type { WorkoutRow } from "@/contracts/entities";
import { ActiveWorkout } from "./ActiveWorkout";

// Each ExerciseBlock renders one ModalityBadge, with its exercise's modality: counting those counts block renders per exercise.
const badgeRenders = vi.hoisted(() => new Map<string, number>());
vi.mock("@/components/exercises/ModalityBadge", () => ({
  ModalityBadge: ({ modality }: { modality: string }) => {
    badgeRenders.set(modality, (badgeRenders.get(modality) ?? 0) + 1);
    return <span data-badge={modality} />;
  },
}));

const original = { showModal: HTMLDialogElement.prototype.showModal, close: HTMLDialogElement.prototype.close };
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = original.showModal;
  HTMLDialogElement.prototype.close = original.close;
});

let workout: WorkoutRow;

beforeEach(async () => {
  badgeRenders.clear();
  localStorage.clear();
  activateUserDb("user-1");
  const bench = await repo.exercises.create({ slug: "bench", name: "Bench", modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL" });
  const fly = await repo.exercises.create({ slug: "fly", name: "Fly", modality: "CABLE", equipment: "CABLE", loadType: "TOTAL" });
  // A finished workout from last week, so "last time" and the record history have something to load.
  const past = await repo.workouts.create({ startedAt: "2026-10-01T17:00:00.000Z", localDate: "2026-10-01", timezone: "UTC", endedAt: "2026-10-01T18:00:00.000Z" });
  const pastWe = await repo.workoutExercises.create({ workoutId: past.id, exerciseId: bench.id, position: "a0" });
  await repo.sets.create({ workoutExerciseId: pastWe.id, position: "a0", weightKg: 100, reps: 5, completedAt: "2026-10-01T17:10:00.000Z" });
  workout = await repo.workouts.create({ startedAt: new Date().toISOString(), localDate: new Date().toISOString().slice(0, 10), timezone: "UTC" });
  const weBench = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: bench.id, position: "a0" });
  const weFly = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: fly.id, position: "a1" });
  for (const we of [weBench, weFly]) {
    await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 60, reps: 8 });
    await repo.sets.create({ workoutExerciseId: we.id, position: "a1", weightKg: 60, reps: 8 });
  }
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetAllDbs();
});

async function renderActive() {
  render(
    <ToastProvider>
      <ActiveWorkout workout={workout} onFinish={() => undefined} onSaveTemplate={() => undefined} onDiscarded={() => undefined} />
    </ToastProvider>,
  );
  await screen.findByRole("region", { name: "Fly" });
  // Let the first loads (structure, sets, history) and their follow-up renders finish.
  await new Promise((r) => setTimeout(r, 400));
}
const blocks = () => ({ bench: badgeRenders.get("FREE_WEIGHT") ?? 0, fly: badgeRenders.get("CABLE") ?? 0 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("ActiveWorkout renders", () => {
  it("the elapsed clock ticks without re-rendering any exercise block", async () => {
    await renderActive();
    const before = blocks();
    const clock = screen.getByTestId("elapsed").textContent;
    await wait(2300);
    expect(screen.getByTestId("elapsed").textContent).not.toBe(clock);
    expect(blocks()).toEqual(before);
  });

  it("the rest countdown ticks without re-rendering any exercise block", async () => {
    await renderActive();
    await userEvent.click(within(screen.getByRole("region", { name: "Bench" })).getByRole("button", { name: "Complete set 1" }));
    await waitFor(() => expect(screen.getByTestId("rest-clock")).toBeInTheDocument());
    await wait(500); // the completion's own re-renders settle
    const before = blocks();
    const clock = screen.getByTestId("rest-clock").textContent;
    await wait(1300);
    expect(screen.getByTestId("rest-clock").textContent).not.toBe(clock);
    expect(blocks()).toEqual(before);
  });

  it("a set write re-renders only its own exercise and does not re-read the history", async () => {
    await renderActive();
    const lastTime = vi.spyOn(repo.sets, "lastTime");
    const forSeries = vi.spyOn(repo.sets, "forSeries");
    const before = blocks();
    await userEvent.click(within(screen.getByRole("region", { name: "Bench" })).getByRole("button", { name: "Increase Set 1 reps" }));
    await waitFor(() => expect(blocks().bench).toBeGreaterThan(before.bench));
    await wait(300);
    expect(blocks().fly).toBe(before.fly);
    expect(blocks().bench).toBeLessThanOrEqual(before.bench + 2);
    expect(lastTime).not.toHaveBeenCalled();
    expect(forSeries).not.toHaveBeenCalled();
    // And the write itself landed.
    const sets = await repo.sets.forWorkout(workout.id);
    expect(sets.filter((s) => s.reps === 9)).toHaveLength(1);
  });

  it("shows last time and records once the history has loaded, not before", async () => {
    await renderActive();
    expect(within(screen.getByRole("region", { name: "Bench" })).getAllByText(/last 100 × 5/).length).toBeGreaterThan(0);
  });
});
