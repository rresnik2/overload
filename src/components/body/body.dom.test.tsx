import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildBodyPayload, EMPTY_BODY_FORM } from "./payload";

const add = vi.fn();
vi.mock("@/server/actions/body", () => ({
  addBodyMetricAction: (...a: unknown[]) => add(...a),
  editBodyMetricAction: vi.fn(),
  deleteBodyMetricAction: vi.fn(),
}));
vi.mock("@/client/sync", () => ({ syncNow: vi.fn(async () => ({ ok: true })) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BodyLog } from "./BodyLog";

beforeEach(() => add.mockReset());

const renderLog = (over: Partial<Parameters<typeof BodyLog>[0]> = {}) =>
  render(<BodyLog today="2026-10-14" unit="KG" sex="MALE" heightCm={180} entries={[]} {...over} />);

describe("body payload", () => {
  it("converts pounds to kg, blanks to null and never carries identity or derived fields", () => {
    const p = buildBodyPayload({ ...EMPTY_BODY_FORM("2026-10-14"), weight: "176", neckCm: "39,5", notes: "  " }, "LB");
    expect(p.weightKg).toBeCloseTo(79.83, 2);
    expect(p.neckCm).toBe(39.5);
    expect(p.waistCm).toBeNull();
    expect(p.notes).toBeNull();
    expect(Object.keys(p)).not.toContain("userId");
    expect(Object.keys(p)).not.toContain("measuredAt");
  });

  it("a Navy method sends no body-fat % (the server computes it)", () => {
    const p = buildBodyPayload({ ...EMPTY_BODY_FORM("2026-10-14"), bodyFatMethod: "NAVY_TAPE", bodyFatPct: "9", neckCm: "39", waistCm: "84" }, "KG");
    expect(p.bodyFatPct).toBeNull();
    expect(p.bodyFatMethod).toBe("NAVY_TAPE");
  });
});

describe("BodyLog and the Navy calculator", () => {
  it("shows the estimate once neck and waist are entered, then posts the tape and the method", async () => {
    add.mockResolvedValue({ ok: true, data: { id: "x" } });
    renderLog();
    expect(screen.queryByTestId("navy-result")).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Neck"), "39");
    await user.type(screen.getByLabelText("Waist"), "84");
    const result = screen.getByTestId("navy-result");
    expect(Number.parseFloat(result.textContent!)).toBeGreaterThan(8);
    await user.click(screen.getByRole("button", { name: "Use this estimate" }));
    expect(screen.getByLabelText("Body fat")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save measurement" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect(add.mock.calls[0]![0]).toMatchObject({ localDate: "2026-10-14", neckCm: 39, waistCm: 84, bodyFatMethod: "NAVY_TAPE", bodyFatPct: null });
    expect(await screen.findByText("Measurement saved.")).toBeInTheDocument();
  });

  it("women need a hip measurement for the estimate", async () => {
    renderLog({ sex: "FEMALE" });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Neck"), "33");
    await user.type(screen.getByLabelText("Waist"), "72");
    expect(screen.queryByTestId("navy-result")).toBeNull();
    await user.type(screen.getByLabelText("Hip"), "98");
    expect(screen.getByTestId("navy-result")).toBeInTheDocument();
  });

  it("without sex and height the calculator explains what is missing", () => {
    renderLog({ sex: null, heightCm: null });
    expect(screen.getByText(/needs your sex and height/)).toBeInTheDocument();
  });

  it("shows server field errors", async () => {
    add.mockResolvedValue({ ok: false, error: "Check the highlighted fields", fieldErrors: { _: "Enter at least one measurement" } });
    renderLog();
    fireEvent.submit(screen.getByRole("form", { name: "Log a measurement" }));
    expect(await screen.findByText("Enter at least one measurement")).toBeInTheDocument();
  });
});
