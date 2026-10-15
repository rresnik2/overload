import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { generateLifterRows } from "@/lib/fixtures/generate";
import { buildOverview } from "@/server/queries/progress.shape";
import { buildE1rmRows, E1rmForecastChart } from "./E1rmForecastChart";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { ChartFrame } from "./ChartFrame";
import { dayNumber, dayToLocalDate, formatDate } from "./format";
import { WeeklySetsChart } from "./WeeklySetsChart";

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const table = { caption: "Squat e1RM", columns: ["Date", "kg"], rows: [["Oct 1", 100], ["Oct 8", 102.5]] };

describe("ChartFrame", () => {
  it("wires the summary to the plot with aria-describedby and ships the table fallback", () => {
    render(<ChartFrame title="Estimated 1RM (kg)" summary="Latest 102.5 kg." table={table}><svg data-testid="plot" /></ChartFrame>);
    const plot = screen.getByRole("img", { name: "Estimated 1RM (kg)" });
    const describedBy = plot.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe("Latest 102.5 kg.");
    expect(within(plot).getByTestId("plot")).toBeInTheDocument();
    const grid = screen.getByRole("table", { hidden: true });
    expect(within(grid).getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent)).toEqual(["Date", "kg"]);
    expect(within(grid).getAllByRole("row", { hidden: true })).toHaveLength(3);
    expect(screen.getByText("View as table")).toBeInTheDocument();
  });

  it("loading: skeleton, aria-busy, no plot and no table", () => {
    const { container } = render(<ChartFrame title="T" summary="s" state="loading" table={table}><svg data-testid="plot" /></ChartFrame>);
    expect(container.querySelector("figure")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("plot")).toBeNull();
    expect(screen.getByText("Loading chart")).toBeInTheDocument();
    expect(screen.queryByText("View as table")).toBeNull();
  });

  it("empty: says why and what to do instead of an empty plot", () => {
    render(<ChartFrame title="T" summary="s" state="empty" empty={{ title: "No sets yet", description: "Log a set.", action: <a href="/workout">Start</a> }} table={null}><svg data-testid="plot" /></ChartFrame>);
    expect(screen.getByText("No sets yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByTestId("plot")).toBeNull();
  });

  it("low-data: keeps the chart and adds the note", () => {
    render(<ChartFrame title="T" summary="s" state="low-data" lowData={{ title: "Needs 6 sessions for a forecast", description: "You have 3." }} table={table}><svg data-testid="plot" /></ChartFrame>);
    expect(screen.getByTestId("plot")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Needs 6 sessions for a forecast");
  });

  it("shows a legend only for two or more series", () => {
    const { rerender } = render(<ChartFrame title="T" summary="s" table={null} legend={[{ label: "One", color: "red" }]}><span /></ChartFrame>);
    expect(screen.queryByRole("list", { name: /legend/ })).toBeNull();
    rerender(<ChartFrame title="T" summary="s" table={null} legend={[{ label: "One", color: "red" }, { label: "Two", color: "blue", kind: "dashed" }]}><span /></ChartFrame>);
    expect(screen.getByRole("list", { name: "T: legend" })).toBeInTheDocument();
  });
});

describe("e1RM chart data", () => {
  const rows = generateLifterRows();
  const squat = rows.planted!.squatProgressing.seriesKey;
  const pts = [
    { localDate: "2026-10-01", e1rmKg: 100, isDeload: false, isPr: false },
    { localDate: "2026-10-08", e1rmKg: 102.5, isDeload: false, isPr: true },
  ];

  it("adds forecast rows with 50% and 80% bands only when the model returned ok", () => {
    const ok = buildE1rmRows(pts, { status: "ok", usedSessions: 6, excluded: { deload: 0, outliers: 0, beforeLayoff: 0 }, points: [{ localDate: "2026-10-22", p50: 105, low50: 103, high50: 107, low80: 101, high80: 109 }] }, "KG");
    expect(ok).toHaveLength(3);
    expect(ok[2]).toMatchObject({ p50: 105, band50: [103, 107], band80: [101, 109] });
    expect(ok[1]).toMatchObject({ p50: 102.5, band50: [102.5, 102.5] }); // the fan starts at the last session
    const low = buildE1rmRows(pts, { status: "insufficient", reason: "sessions", haveSessions: 2, haveWeeks: 1, needSessions: 6, needWeeks: 3 }, "KG");
    expect(low).toHaveLength(2);
    expect(low.every((r) => r.band80 === undefined && r.p50 === undefined)).toBe(true);
  });

  it("converts to the user's unit at the edge (kg in, lb out)", () => {
    const [first] = buildE1rmRows(pts, { status: "insufficient", reason: "sessions", haveSessions: 2, haveWeeks: 1, needSessions: 6, needWeeks: 3 }, "LB");
    expect(first!.e1rm).toBeCloseTo(220.5, 1);
  });

  it("mounts without crashing", () => {
    expect(squat).toBeTruthy();
    const { container } = render(<E1rmForecastChart points={pts} forecast={{ status: "insufficient", reason: "sessions", haveSessions: 2, haveWeeks: 1, needSessions: 6, needWeeks: 3 }} modality="FREE_WEIGHT" unit="KG" label="Squat" />);
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy();
  });

  it("date axis helpers round-trip", () => {
    expect(dayToLocalDate(dayNumber("2026-10-14"))).toBe("2026-10-14");
    expect(formatDate("2026-10-14")).toBe("Oct 14");
    expect(formatDate("2026-10-14", true)).toBe("Oct 14, 2026");
  });
});

describe("weekly sets and heatmap", () => {
  const { input } = generateLifterRows();
  const overview = buildOverview({ today: input.today, profile: input.profile, exercises: input.exercises, machineProfiles: input.machineProfiles, sets: input.sets, bodyweightKg: 82 });

  it("lists muscles with a written status (never colour alone) and a table", () => {
    const week = overview.weeks[1]!;
    render(<WeeklySetsChart weekStart={week.weekStart} muscles={week.muscles} />);
    const list = screen.getByTestId("weekly-sets");
    expect(within(list).getAllByRole("listitem").length).toBe(week.muscles.length);
    expect(list.textContent).toMatch(/Below the band|In the band|Above the band/);
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
  });

  it("empty week shows the empty state", () => {
    render(<WeeklySetsChart weekStart="2026-10-12" muscles={[]} />);
    expect(screen.getByText("No hard sets this week")).toBeInTheDocument();
  });

  it("heatmap renders 16 weeks x 7 cells and a table fallback", () => {
    render(<CalendarHeatmap heatmap={overview.heatmap} />);
    expect(document.querySelectorAll(".heatmap__cell")).toHaveLength(16 * 7);
    expect(screen.getByRole("table", { hidden: true })).toBeInTheDocument();
  });
});
