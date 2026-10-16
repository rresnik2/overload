import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LiftChartData, LiftTile } from "@/lib/analytics/lifts";
import { E1rmChart } from "./E1rmChart";
import { E1rmTiles, changeText } from "./E1rmTiles";

const tile = (lift: LiftTile["lift"], name: string, e1rmKg: number | null, changeKg: number | null): LiftTile => ({
  lift,
  name,
  seriesKey: e1rmKg == null ? null : `s-${lift}`,
  e1rmKg,
  changeKg,
  lastLocalDate: e1rmKg == null ? null : "2026-10-10",
});
const tiles = [
  tile("SQUAT", "Back squat", 142.5, 7.5),
  tile("BENCH_PRESS", "Bench press", 105, 0),
  tile("DEADLIFT", "Deadlift", null, null),
  tile("OVERHEAD_PRESS", "Overhead press", 62.4, -2.5),
];

describe("E1rmTiles", () => {
  it("shows the estimate, the 4-week change and the plate colour of each lift", () => {
    render(<E1rmTiles tiles={tiles} unit="KG" />);
    const squat = screen.getByText("Back squat").closest("li")!;
    expect(squat).toHaveAttribute("data-state", "filled");
    expect(squat.style.getPropertyValue("--lift")).toBe("var(--plate-red)");
    expect(within(squat).getByText("142.5")).toBeInTheDocument();
    expect(within(squat).getByText("+7.5 kg")).toHaveClass("today-tile__delta--up");
    expect(screen.getByText("Bench press").closest("li")!.style.getPropertyValue("--lift")).toBe("var(--plate-blue)");
    expect(screen.getByText("Overhead press").closest("li")!.style.getPropertyValue("--lift")).toBe("var(--plate-green)");
    expect(screen.getByText("Deadlift").closest("li")!.style.getPropertyValue("--lift")).toBe("var(--plate-yellow)");
    expect(within(screen.getByText("Overhead press").closest("li")!).getByText("−2.5 kg")).toHaveClass("today-tile__delta--down");
  });

  it("writes 'flat' in the accent tone when the change is 0", () => {
    render(<E1rmTiles tiles={tiles} unit="KG" />);
    const flat = within(screen.getByText("Bench press").closest("li")!).getByText("flat");
    expect(flat).toHaveClass("today-tile__delta--flat");
  });

  it("invites a lift without history to log a set", () => {
    render(<E1rmTiles tiles={tiles} unit="KG" />);
    const dl = screen.getByText("Deadlift").closest("li")!;
    expect(dl).toHaveAttribute("data-state", "empty");
    expect(within(dl).getByText("Log a set to see your estimate")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("converts to pounds", () => {
    render(<E1rmTiles tiles={[tile("SQUAT", "Back squat", 100, 5)]} unit="LB" />);
    expect(screen.getByText("220.5")).toBeInTheDocument();
    expect(screen.getByText("+11 lb")).toBeInTheDocument();
  });

  it("says when there is no 4-week baseline", () => {
    expect(changeText(null, "KG")).toEqual({ text: "No 4-week change yet", tone: "none" });
    expect(changeText(0, "LB")).toEqual({ text: "flat", tone: "flat" });
  });
});

describe("E1rmChart", () => {
  const chart: LiftChartData = {
    lift: "BENCH_PRESS",
    name: "Bench press",
    seriesKey: "s",
    from: "2026-07-20",
    to: "2026-10-12",
    points: [
      { localDate: "2026-08-01", e1rmKg: 100, isDeload: false },
      { localDate: "2026-09-10", e1rmKg: 105, isDeload: false },
      { localDate: "2026-10-08", e1rmKg: 105, isDeload: false },
    ],
    band: { from: "2026-08-31", to: "2026-10-12", weeks: 6 },
    stalled: true,
  };

  it("draws the series, the flat band and a table view", () => {
    const { container } = render(<E1rmChart chart={chart} unit="KG" />);
    expect(screen.getByRole("img", { name: "Bench press e1RM · 12 weeks" })).toBeInTheDocument();
    expect(container.querySelectorAll(".today-chart__dot")).toHaveLength(3);
    expect(container.querySelector(".today-chart__band")).not.toBeNull();
    expect(screen.getByText("Flat 6 wk")).toBeInTheDocument();
    expect(screen.getByText("View as table")).toBeInTheDocument();
  });

  it("has no band for a lift that is moving", () => {
    const { container } = render(<E1rmChart chart={{ ...chart, band: null, stalled: false }} unit="KG" />);
    expect(container.querySelector(".today-chart__band")).toBeNull();
  });

  it("shows an empty state without history", () => {
    render(<E1rmChart chart={null} unit="KG" />);
    expect(screen.getByText("No estimate to chart yet")).toBeInTheDocument();
  });
});
