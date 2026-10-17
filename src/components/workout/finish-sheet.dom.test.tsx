import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FinishSheet } from "./FinishSheet";
import type { WorkoutSummary } from "./view";

// jsdom has no <dialog> modal: open and close by attribute, as the other sheet tests do
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

const pr = (setId: string, name: string, weightKg: number, reps: number, value: number): WorkoutSummary["prs"][number] => ({
  setId,
  exerciseName: name,
  headline: { seriesKey: "s", exerciseId: "e", machineProfileId: null, type: "E1RM", reps, value, setId, workoutId: "w", achievedAt: "2026-10-16T17:30:00.000Z" },
  exercise: { name, equipment: "BARBELL", loadType: "TOTAL", isUnilateral: false },
  weightKg,
  inputUnit: "KG",
  reps,
});

const summary = (prs: WorkoutSummary["prs"]): WorkoutSummary => ({ durationMs: 3_360_000, exercises: 2, sets: 9, warmupSets: 2, unfinishedSets: 0, volumeKg: 5400, prSets: prs.length, prs });

describe("FinishSheet: the PR moment", () => {
  it("draws the first record on its bar with the set in readout type, and lists the others below", () => {
    render(<FinishSheet open phase="done" unit="KG" summary={summary([pr("a", "Bench Press", 100, 7, 130), pr("b", "Barbell Squat", 140, 3, 152)])} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const moment = screen.getByRole("region", { name: "New personal record: Bench Press" });
    expect(moment).toHaveTextContent("New PR · Bench Press");
    expect(moment).toHaveTextContent("100kg×7");
    expect(moment).toHaveTextContent("Estimated 1RM 130 kg");
    // 100 kg on a 20 kg bar: 25 + 15 a side, sliding on
    const art = moment.querySelector(".eq-art")!;
    expect(art).toHaveClass("eq-art--slide");
    expect([...art.querySelectorAll(".eq-side--r .eq-plate")].map((p) => p.getAttribute("data-weight"))).toEqual(["25", "15"]);
    expect(within(screen.getByRole("list", { name: "More personal records" })).getByText("Barbell Squat")).toBeInTheDocument();
  });

  it("has no PR moment without a record", () => {
    render(<FinishSheet open phase="confirm" unit="KG" summary={summary([])} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByTestId("pr-moment")).toBeNull();
  });
});
