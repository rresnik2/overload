// /workout against a real (fake-indexeddb) repo: what happens when the lifter closes "Workout saved".
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { ToastProvider } from "@/components/ui/Toast";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: () => undefined, back: () => undefined, refresh: () => undefined }), usePathname: () => "/workout" }));
vi.mock("@/client/sync", async () => {
  const hooks = await import("@/client/sync/hooks");
  return { useSyncStatus: hooks.useSyncStatus, useOnSynced: hooks.useOnSynced, syncNow: () => Promise.resolve({ ok: true, pushed: 0, pulled: 0, rejected: 0, newPrs: [] }) };
});

import { WorkoutScreen } from "./WorkoutScreen";

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

beforeEach(async () => {
  push.mockReset();
  localStorage.clear();
  activateUserDb("user-1");
  const bench = await repo.exercises.create({ slug: "bench", name: "Bench", modality: "FREE_WEIGHT", equipment: "BARBELL", loadType: "TOTAL" });
  const workout = await repo.workouts.create({ startedAt: new Date().toISOString(), localDate: new Date().toISOString().slice(0, 10), timezone: "UTC" });
  const we = await repo.workoutExercises.create({ workoutId: workout.id, exerciseId: bench.id, position: "a0" });
  await repo.sets.create({ workoutExerciseId: we.id, position: "a0", weightKg: 60, reps: 8, completedAt: new Date().toISOString() });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await resetAllDbs();
});

async function finishWorkout() {
  render(
    <ToastProvider>
      <WorkoutScreen />
    </ToastProvider>,
  );
  const finish = await screen.findByRole("button", { name: /^Finish$/ });
  await waitFor(() => expect(finish).toBeEnabled()); // the workout view has loaded
  await userEvent.click(finish);
  await userEvent.click(await screen.findByRole("button", { name: "Finish workout" }));
  await screen.findByRole("heading", { name: "Workout saved" });
}

describe("Workout saved", () => {
  it("Done takes the lifter to Today, not to the empty start screen", async () => {
    await finishWorkout();
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(push).toHaveBeenCalledExactlyOnceWith("/today"));
  });

  it("stays on the start screen when offline, where Today may not load", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await finishWorkout();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByRole("button", { name: "Start empty workout" })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
