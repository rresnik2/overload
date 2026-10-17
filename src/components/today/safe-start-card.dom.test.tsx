import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./TodayStartCard", () => ({
  TodayStartCard: () => {
    throw new Error("Cannot read properties of undefined (reading 'filter')");
  },
}));

const { SafeStartCard } = await import("./SafeStartCard");

describe("SafeStartCard", () => {
  it("keeps Today open with a plain way to start when Next up throws, and names the error", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<SafeStartCard unit="KG" />);
    expect(screen.getByRole("link", { name: "Go to the workout screen" })).toHaveAttribute("href", "/workout");
    expect(screen.getByText("Next up could not load")).toBeInTheDocument();
    expect(screen.getByText("Cannot read properties of undefined (reading 'filter')")).toBeInTheDocument();
  });
});
