import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { generateLifterRows } from "@/lib/fixtures/generate";
import { buildExerciseProgress, buildOverview } from "@/server/queries/progress.shape";
import { buildPrBoard } from "@/server/queries/prs.shape";
import { ExerciseCharts } from "./ExerciseCharts";
import { BigThreeCard, SeriesCards } from "./OverviewSections";
import { PrBoardView } from "./PrBoardView";
import { SeriesPicker } from "./SeriesPicker";
import { lowDataCopy } from "./summaries";

const rows = generateLifterRows();
const { input } = rows;
const planted = rows.planted!;
const exercise = (key: string) => input.exercises.find((e) => key.startsWith(e.id))!;
const progress = (key: string) =>
  buildExerciseProgress({
    exercise: exercise(key), machineProfiles: input.machineProfiles, sets: input.sets.filter((s) => s.exerciseId === exercise(key).id),
    selectedKey: key, profile: input.profile, today: input.today, firstWorkoutDate: "2026-06-22", bodyweightKg: 82,
  });

describe("exercise charts", () => {
  it("long series: forecast legend (dashed line, 50% and 80% ranges) and no low-data note", () => {
    const sq = progress(planted.squatProgressing.seriesKey);
    render(<ExerciseCharts exerciseName="Barbell Squat" series={sq.selected!} unit="KG" />);
    expect(screen.getByTestId("chart-e1rm")).toHaveAttribute("data-chart-state", "ready");
    const legend = within(screen.getByRole("list", { name: "Estimated 1RM (kg): legend" }));
    expect(legend.getByText("Forecast (median)")).toBeInTheDocument();
    expect(legend.getByText("50% range")).toBeInTheDocument();
    expect(legend.getByText("80% range")).toBeInTheDocument();
    expect(screen.queryByTestId("low-data")).toBeNull();
    expect(screen.getByTestId("forecast-note")).toBeInTheDocument();
    expect(screen.queryByTestId("percentile")).toBeNull(); // no norms embedded: percentile UI hidden
    for (const id of ["chart-e1rm", "chart-topset", "chart-volume"]) {
      const frame = screen.getByTestId(id);
      expect(frame.querySelector("details table")).not.toBeNull(); // table fallback
      const plot = frame.querySelector('[role="img"]')!;
      expect(document.getElementById(plot.getAttribute("aria-describedby")!)?.textContent).toBeTruthy();
    }
  });

  it("short series: 'Needs 6 sessions' instead of a forecast", () => {
    const curl = progress(planted.legCurl.seriesKey);
    render(<ExerciseCharts exerciseName="Lying Leg Curls" series={curl.selected!} unit="KG" />);
    expect(screen.getByTestId("chart-e1rm")).toHaveAttribute("data-chart-state", "low-data");
    expect(screen.getByTestId("low-data")).toHaveTextContent(/Needs 6 sessions/);
    expect(screen.queryByText("Forecast (median)")).toBeNull();
    expect(screen.queryByTestId("forecast-note")).toBeNull();
  });

  it("lb users see pounds", () => {
    const sq = progress(planted.squatProgressing.seriesKey);
    render(<ExerciseCharts exerciseName="Barbell Squat" series={sq.selected!} unit="LB" />);
    expect(screen.getByText("Estimated 1RM (lb)")).toBeInTheDocument();
  });

  it("lowDataCopy covers sessions, span and layoff", () => {
    const base = { status: "insufficient" as const, haveSessions: 3, haveWeeks: 2, needSessions: 6 as const, needWeeks: 3 as const };
    expect(lowDataCopy({ ...base, reason: "sessions" }).title).toBe("Needs 6 sessions for a forecast");
    expect(lowDataCopy({ ...base, reason: "span" }).title).toBe("Needs 6 sessions over 3 weeks");
    expect(lowDataCopy({ ...base, reason: "layoff" }).title).toMatch(/Needs 6 sessions since your break/);
  });
});

describe("series picker", () => {
  it("lists the two leg-press gyms as separate links and marks the selected one", () => {
    const { gymA, gymB } = planted.legPress;
    const out = progress(gymA.seriesKey);
    render(<SeriesPicker exerciseId={out.exerciseId} series={out.series} selectedKey={gymB.seriesKey} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.getAttribute("data-series-key")).sort()).toEqual([gymA.seriesKey, gymB.seriesKey].sort());
    expect(links.filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
    expect(links.find((l) => l.getAttribute("aria-current"))?.getAttribute("data-series-key")).toBe(gymB.seriesKey);
  });

  it("renders nothing for an exercise with a single series", () => {
    const out = progress(planted.squatProgressing.seriesKey);
    const { container } = render(<SeriesPicker exerciseId={out.exerciseId} series={out.series} selectedKey={out.series[0]!.seriesKey} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("overview cards", () => {
  const overview = buildOverview({ today: input.today, profile: input.profile, exercises: input.exercises, machineProfiles: input.machineProfiles, sets: input.sets, bodyweightKg: 82 });

  it("one link per series; machine cards point at their own series", () => {
    render(<SeriesCards cards={overview.cards} unit="KG" />);
    expect(screen.getAllByRole("link")).toHaveLength(overview.cards.length);
    const machineLinks = screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.includes("?series="));
    expect(machineLinks.length).toBe(overview.cards.filter((c) => c.ref.machineProfileId).length);
  });

  it("DOTS card shows what is missing and never scores a partial big three", () => {
    render(<BigThreeCard bigThree={overview.bigThree} unit="KG" />);
    expect(screen.getByTestId("bigthree")).toHaveTextContent(/appears once you have logged a barbell squat, bench press and deadlift/);
    expect(screen.queryByText("DOTS")).toBeNull();
  });

  it("DOTS card is absent without any big-three lift", () => {
    const { container } = render(<BigThreeCard bigThree={{ lifts: [{ standardLift: "SQUAT", e1rmKg: null }, { standardLift: "BENCH_PRESS", e1rmKg: null }, { standardLift: "DEADLIFT", e1rmKg: null }], totalKg: null, bodyweightKg: null, dots: null }} unit="KG" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PR board", () => {
  it("renders a table per series with weights in the user's unit", () => {
    const row = { id: "1", exerciseId: input.exercises[0]!.id, machineProfileId: null, seriesKey: input.exercises[0]!.id, type: "E1RM" as const, reps: 0, value: 100, previousValue: 95, setId: null, workoutId: "w1", achievedAt: "2026-10-10T10:00:00.000Z" };
    const board = buildPrBoard({ rows: [row], exercises: input.exercises, machineProfiles: [], workoutDates: new Map([["w1", "2026-10-10"]]) });
    render(<PrBoardView board={board} unit="LB" />);
    expect(screen.getAllByText(/220\.5 lb/).length).toBeGreaterThan(0);
    expect(screen.getByText(/up from 209\.4 lb/)).toBeInTheDocument();
  });
});
