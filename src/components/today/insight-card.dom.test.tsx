import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { InsightFacts } from "@/contracts/insights";
import { TodayInsightCard } from "./TodayInsightCard";

type Finding = InsightFacts["insights"][number];
const finding = (id: string, severity: Finding["severity"], title: string): Finding => ({
  id: `insight:${id}`,
  ruleId: "volume-band",
  severity,
  title,
  body: "Body.",
  evidence: [],
  citations: [],
});
const preview = (...insights: Finding[]) => ({ weekStart: "2026-10-05", insights }) as unknown as InsightFacts;

describe("TodayInsightCard without a written report", () => {
  it("leads with the first warning of the rule-based findings", () => {
    render(<TodayInsightCard report={null} preview={preview(finding("a", "info", "Steady week"), finding("b", "warning", "Low volume for quads"), finding("c", "warning", "Skipped legs"))} />);
    expect(screen.getByText("Low volume for quads")).toBeInTheDocument();
    expect(screen.getByText(/Heads up/)).toBeInTheDocument();
    expect(screen.queryByText(/first weekly review appears/)).toBeNull();
    expect(screen.getByRole("link", { name: "Read the full review" })).toHaveAttribute("href", "/insights");
  });

  it("falls back to the first finding when none is a warning", () => {
    render(<TodayInsightCard report={null} preview={preview(finding("a", "suggestion", "Add a back day"), finding("b", "celebration", "New PR"))} />);
    expect(screen.getByText("Add a back day")).toBeInTheDocument();
  });

  it("keeps the waiting copy for a user with nothing to review", () => {
    const { rerender } = render(<TodayInsightCard report={null} preview={preview()} />);
    expect(screen.getByText("Your first weekly review appears after a week of logged training.")).toBeInTheDocument();
    rerender(<TodayInsightCard report={null} />);
    expect(screen.getByText("Your first weekly review appears after a week of logged training.")).toBeInTheDocument();
  });
});
