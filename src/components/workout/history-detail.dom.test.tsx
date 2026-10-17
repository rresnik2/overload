import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activateUserDb, resetAllDbs } from "@/client/db/active";
import { repo } from "@/client/repo";
import { HistoryDetailHeader } from "./HistoryDetail";

beforeEach(() => {
  activateUserDb("history-detail-user");
});
afterEach(async () => {
  await resetAllDbs();
});

describe("HistoryDetailHeader", () => {
  it("titles the page with the workout's own name", async () => {
    const w = await repo.workouts.create({ startedAt: "2026-08-01T10:00:00.000Z", localDate: "2026-08-01", timezone: "UTC", title: "Upper B" });
    render(<HistoryDetailHeader id={w.id} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Upper B" })).toBeInTheDocument();
    await repo.workouts.update(w.id, { title: "Upper C" });
    expect(await screen.findByRole("heading", { level: 1, name: "Upper C" })).toBeInTheDocument();
  });

  it("says 'Workout' for an unnamed workout", async () => {
    const w = await repo.workouts.create({ startedAt: "2026-08-01T10:00:00.000Z", localDate: "2026-08-01", timezone: "UTC" });
    render(<HistoryDetailHeader id={w.id} />);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Workout"));
  });
});
