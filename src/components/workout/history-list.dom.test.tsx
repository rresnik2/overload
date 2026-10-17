import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { HISTORY_PAGE, HistoryList } from "./HistoryList";

beforeEach(() => {
  activateUserDb("history-user");
});
afterEach(async () => {
  await resetAllDbs();
});

describe("HistoryList", () => {
  it("shows a page of workouts, newest first, and loads the earlier ones on request", async () => {
    const total = HISTORY_PAGE + 5;
    for (let i = 0; i < total; i++) {
      const day = String(i + 1).padStart(2, "0");
      const w = await repo.workouts.create({ startedAt: `2026-08-${day}T10:00:00.000Z`, localDate: `2026-08-${day}`, timezone: "UTC", title: `Workout ${i + 1}` });
      await repo.workouts.finish(w.id, `2026-08-${day}T11:00:00.000Z`);
    }
    render(<HistoryList />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(HISTORY_PAGE));
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Workout 25");
    expect(screen.queryByText("Workout 1", { exact: true })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show earlier workouts (5 more)" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(total));
    expect(screen.queryByRole("button", { name: /Show earlier workouts/ })).not.toBeInTheDocument();
  });

  it("has no button when everything fits on one page", async () => {
    const w = await repo.workouts.create({ startedAt: "2026-08-01T10:00:00.000Z", localDate: "2026-08-01", timezone: "UTC" });
    await repo.workouts.finish(w.id, "2026-08-01T11:00:00.000Z");
    render(<HistoryList />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
    expect(screen.queryByRole("button", { name: /Show earlier workouts/ })).not.toBeInTheDocument();
  });
});
