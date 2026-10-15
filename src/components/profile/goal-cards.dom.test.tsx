import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TRAINING_GOAL_VALUES, type TrainingGoal } from "@/contracts/enums";
import { VOLUME_BANDS } from "@/lib/analytics/constants";
import { GOAL_CARDS } from "./choices";
import { GoalCards } from "./GoalCards";

describe("goal cards", () => {
  it("has one card per training goal, with a two-line explanation each", () => {
    expect(GOAL_CARDS.map((c) => c.value).sort()).toEqual([...TRAINING_GOAL_VALUES].sort());
    for (const card of GOAL_CARDS) {
      expect(card.summary.length).toBeGreaterThan(5);
      expect(card.changes.length).toBeGreaterThan(20);
    }
  });

  it("states the same weekly set bands the analytics use", () => {
    const text = (goal: TrainingGoal) => GOAL_CARDS.find((c) => c.value === goal)!.changes;
    expect(text("HYPERTROPHY")).toContain(`${VOLUME_BANDS.HYPERTROPHY.low} to ${VOLUME_BANDS.HYPERTROPHY.high}`);
    expect(text("STRENGTH")).toContain(`${VOLUME_BANDS.STRENGTH.low} to ${VOLUME_BANDS.STRENGTH.high}`);
    expect(text("GENERAL")).toContain(`${VOLUME_BANDS.GENERAL.low} to ${VOLUME_BANDS.GENERAL.high}`);
    expect(text("FAT_LOSS")).toContain("0.5 to 1%");
  });

  it("renders four radio cards, selects one, and offers a hint for each plus the comparison link", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<TrainingGoal | "">("");
      return <GoalCards value={value} onChange={(v) => { setValue(v); onChange(v); }} />;
    }
    render(<Harness />);
    const group = screen.getByRole("group", { name: "Main goal" });
    expect(within(group).getAllByRole("radio")).toHaveLength(4);
    await user.click(screen.getByRole("radio", { name: /Lose weight/ }));
    expect(onChange).toHaveBeenCalledWith("FAT_LOSS");
    expect(screen.getByRole("radio", { name: /Lose weight/ })).toBeChecked();
    expect(within(group).getAllByRole("button", { name: /^What is / })).toHaveLength(4);
    expect(screen.getByRole("link", { name: "Compare the four goals" })).toHaveAttribute("href", "/learn/choosing-a-goal");
  });

  it("works uncontrolled for the settings form (the radio value is read from the form)", () => {
    render(
      <form aria-label="f">
        <GoalCards defaultValue="STRENGTH" required={false} />
      </form>,
    );
    expect(screen.getByRole("radio", { name: /Get stronger/ })).toBeChecked();
    const form = screen.getByRole("form", { name: "f" }) as HTMLFormElement;
    expect(new FormData(form).get("goal")).toBe("STRENGTH");
  });
});
