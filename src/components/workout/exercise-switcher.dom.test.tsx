import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseSwitcher } from "./ExerciseSwitcher";

const NAMES = ["Squat", "Bench press", "Row", "Curl", "Plank"];

function Harness({ start }: { start: number }) {
  const [index, setIndex] = useState(start);
  return (
    <>
      <ExerciseSwitcher names={NAMES} index={index} onGo={setIndex} />
      <p data-testid="focused">{NAMES[index] ?? "none"}</p>
    </>
  );
}

describe("ExerciseSwitcher", () => {
  it("shows the position and names the exercise each button goes to", () => {
    render(<Harness start={1} />);
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous exercise: Squat" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next exercise: Row" })).toBeEnabled();
  });

  it("moves focus through the list and disables the ends (no wrap-around)", async () => {
    render(<Harness start={0} />);
    const prev = () => screen.getByRole("button", { name: /^Previous exercise/ });
    const next = () => screen.getByRole("button", { name: /^Next exercise/ });
    expect(prev()).toBeDisabled();
    await userEvent.click(next());
    expect(screen.getByTestId("focused")).toHaveTextContent("Bench press");
    await userEvent.click(next());
    await userEvent.click(next());
    await userEvent.click(next());
    expect(screen.getByTestId("focused")).toHaveTextContent("Plank");
    expect(screen.getByText("5 of 5")).toBeInTheDocument();
    expect(next()).toBeDisabled();
    await userEvent.click(prev());
    expect(screen.getByTestId("focused")).toHaveTextContent("Curl");
  });

  it("keeps keyboard focus on the button that was pressed", async () => {
    render(<Harness start={1} />);
    const next = screen.getByRole("button", { name: /^Next exercise/ });
    next.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /^Next exercise/ })).toHaveFocus();
  });

  it("when no exercise is focused (all done) Prev goes to the last and Next is disabled", async () => {
    const onGo = vi.fn();
    render(<ExerciseSwitcher names={NAMES} index={-1} onGo={onGo} />);
    expect(screen.getByText("5 exercises")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next exercise" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Previous exercise: Plank" }));
    expect(onGo).toHaveBeenCalledWith(4);
  });

  it("opts out of the swipe region itself", () => {
    render(<Harness start={0} />);
    expect(screen.getByRole("navigation", { name: "Switch exercise" })).toHaveAttribute("data-no-swipe");
  });
});
